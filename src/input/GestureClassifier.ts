// Maps HandData → discrete gesture events.

import type { HandData, GestureEvent, GestureName } from '../utils/types';

interface ClassifierState {
  lastEvent: Record<string, number>;
  lastBothFist: number;
  lastClap: number;
}

const COOLDOWN = 700; // ms between repeats of the same gesture

export class GestureClassifier {
  state: ClassifierState = { lastEvent: {}, lastBothFist: 0, lastClap: 0 };

  classify(data: HandData): GestureEvent[] {
    const now = performance.now();
    const events: GestureEvent[] = [];
    const fistHands: ('Left' | 'Right')[] = [];

    for (const h of data.hands) {
      let g: GestureName = 'none';
      const open = h.openness;
      const tips = h.fingertips;
      const pinch = Math.hypot(tips[0].x - tips[1].x, tips[0].y - tips[1].y);
      // Index extended check: index tip far from wrist, others close.
      const wrist = h.landmarks[0];
      const indexFar = Math.hypot(tips[1].x - wrist.x, tips[1].y - wrist.y) > 0.2;
      const middleClose = Math.hypot(tips[2].x - wrist.x, tips[2].y - wrist.y) < 0.18;

      if (open < 0.35) g = 'fist';
      else if (open > 0.75) g = 'open';
      else if (pinch < 0.05) g = 'pinch';
      else if (indexFar && middleClose) g = 'point';

      if (g === 'fist') fistHands.push(h.handedness);

      if (g !== 'none') {
        const key = h.handedness + ':' + g;
        const last = this.state.lastEvent[key] || 0;
        if (now - last > COOLDOWN) {
          this.state.lastEvent[key] = now;
          events.push({ name: g, hand: h.handedness, timestamp: now });
        }
      }
    }

    // Both fists at once → next mode.
    if (fistHands.length >= 2 && now - this.state.lastBothFist > 1200) {
      this.state.lastBothFist = now;
      events.push({ name: 'fist', bothHands: true, timestamp: now });
    }

    // Clap: two hands within close distance.
    if (data.hands.length === 2) {
      const a = data.hands[0].position, b = data.hands[1].position;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 0.08 && now - this.state.lastClap > 800) {
        this.state.lastClap = now;
        events.push({ name: 'clap', bothHands: true, timestamp: now });
      }
    }
    return events;
  }
}
