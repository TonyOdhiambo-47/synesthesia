// MediaPipe Hands wrapper. Outputs HandData every frame.
// Uses the lightweight @mediapipe/hands solution loaded from CDN.

import type { HandData, HandPoint } from '../utils/types';

declare global {
  interface Window { Hands: any; }
}

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';

// Idempotent script loader. If the same URL is requested twice we return the
// same in-flight promise so a second caller actually waits for `onload` rather
// than racing past a not-yet-executed <script> tag.
const scriptPromises = new Map<string, Promise<void>>();
function loadScript(src: string) {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const prior = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (prior && (prior as any)._loaded) return resolve();
    const s = prior ?? document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.addEventListener('load', () => { (s as any)._loaded = true; resolve(); });
    s.addEventListener('error', () => reject(new Error('Failed to load ' + src)));
    if (!prior) document.head.appendChild(s);
  });
  scriptPromises.set(src, p);
  return p;
}

export class HandTracker {
  video: HTMLVideoElement;
  hands: any = null;
  current: HandData = { hands: [] };
  prevPositions: Map<string, { x: number; y: number; t: number }> = new Map();
  ready = false;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private stopped = false;

  constructor() {
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  async init() {
    await loadScript(CDN + 'hands.js');
    this.hands = new (window as any).Hands({
      locateFile: (f: string) => CDN + f
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    this.hands.onResults((res: any) => this.onResults(res));

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    // Drive MediaPipe with RAF.
    const tick = async () => {
      if (this.stopped) return;
      if (this.video.readyState >= 2) {
        try { await this.hands.send({ image: this.video }); } catch { /* swallow */ }
      }
      if (!this.stopped) this.rafId = requestAnimationFrame(tick);
    };
    tick();
    this.ready = true;
  }

  destroy() {
    this.stopped = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    try { this.hands?.close?.(); } catch { /* ignore */ }
    this.video.srcObject = null;
    this.video.remove();
  }

  private onResults(res: any) {
    const out: HandData = { hands: [] };
    if (!res.multiHandLandmarks) {
      this.current = out;
      return;
    }
    const now = performance.now();
    for (let i = 0; i < res.multiHandLandmarks.length; i++) {
      const lm: any[] = res.multiHandLandmarks[i];
      const handed = res.multiHandedness?.[i]?.label || 'Right';
      // Mirror x because the webcam is selfie-flipped.
      const landmarks: HandPoint[] = lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));
      const palm = landmarks[9]; // middle finger MCP, stable centroid
      const fingertipIdx = [4, 8, 12, 16, 20];
      const fingertips = fingertipIdx.map(idx => landmarks[idx]);

      // Openness: average distance of fingertips from wrist (landmark 0).
      const wrist = landmarks[0];
      let openness = 0;
      for (const f of fingertips) {
        const dx = f.x - wrist.x, dy = f.y - wrist.y;
        openness += Math.sqrt(dx * dx + dy * dy);
      }
      openness = Math.min(1, (openness / 5) * 4); // empirically scaled

      // Rotation: vector from wrist to middle MCP.
      const rotation = Math.atan2(palm.y - wrist.y, palm.x - wrist.x);

      // Velocity from previous frame.
      const key = handed + i;
      const prev = this.prevPositions.get(key);
      let vx = 0, vy = 0;
      if (prev) {
        const dt = Math.max(1, now - prev.t) / 1000;
        vx = (palm.x - prev.x) / dt;
        vy = (palm.y - prev.y) / dt;
      }
      this.prevPositions.set(key, { x: palm.x, y: palm.y, t: now });

      out.hands.push({
        handedness: handed as 'Left' | 'Right',
        position: palm,
        fingertips,
        landmarks,
        velocity: { x: vx, y: vy },
        openness,
        rotation
      });
    }
    this.current = out;
  }

  read(): HandData { return this.current; }
}
