// MediaPipe Hands wrapper. Outputs HandData every frame.
// Uses the lightweight @mediapipe/hands solution loaded from CDN.

import type { HandData, HandPoint } from '../utils/types';

declare global {
  interface Window { Hands: any; }
}

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

export class HandTracker {
  video: HTMLVideoElement;
  hands: any = null;
  current: HandData = { hands: [] };
  prevPositions: Map<string, { x: number; y: number; t: number }> = new Map();
  ready = false;

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

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false
    });
    this.video.srcObject = stream;
    await this.video.play();

    // Drive MediaPipe with RAF.
    const tick = async () => {
      if (this.video.readyState >= 2) {
        await this.hands.send({ image: this.video });
      }
      requestAnimationFrame(tick);
    };
    tick();
    this.ready = true;
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
