// Web Audio API spectral analyzer. Bass / mid / treble / volume / centroid / onset.

import type { AudioData } from '../utils/types';

export class AudioAnalyzer {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  stream: MediaStream | null = null;
  freq!: Uint8Array;
  time!: Uint8Array;
  current: AudioData;
  private prevVolume = 0;
  private onsetCooldown = 0;

  constructor() {
    this.current = {
      bass: 0, mid: 0, treble: 0, volume: 0, centroid: 0,
      onset: false, spectrum: new Uint8Array(0)
    };
  }

  async init() {
    try {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.time = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.current.spectrum = this.freq;
    } catch (e) {
      console.warn('Audio init failed; continuing without sound input.', e);
    }
  }

  destroy() {
    try { this.source?.disconnect(); } catch { /* ignore */ }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }

  update(): AudioData {
    if (!this.analyser) return this.current;
    this.analyser.getByteFrequencyData(this.freq as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.time as Uint8Array<ArrayBuffer>);

    // Bass: bins 0..10  Mid: 10..100  Treble: 100..end
    let bs = 0, ms = 0, ts = 0;
    const N = this.freq.length;
    const bassEnd = Math.floor(N * 0.04);
    const midEnd = Math.floor(N * 0.25);
    for (let i = 0; i < bassEnd; i++) bs += this.freq[i];
    for (let i = bassEnd; i < midEnd; i++) ms += this.freq[i];
    for (let i = midEnd; i < N; i++) ts += this.freq[i];
    const bass = bs / (bassEnd * 255);
    const mid = ms / ((midEnd - bassEnd) * 255);
    const treble = ts / ((N - midEnd) * 255);

    // RMS volume from time-domain.
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      sum += v * v;
    }
    const volume = Math.sqrt(sum / this.time.length);

    // Spectral centroid (brightness).
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      num += i * this.freq[i];
      den += this.freq[i];
    }
    const centroid = den > 0 ? (num / den) / N : 0;

    // Onset detection.
    const now = performance.now();
    let onset = false;
    if (volume - this.prevVolume > 0.06 && now > this.onsetCooldown) {
      onset = true;
      this.onsetCooldown = now + 200;
    }
    this.prevVolume = volume;

    this.current = { bass, mid, treble, volume, centroid, onset, spectrum: this.freq };
    return this.current;
  }
}
