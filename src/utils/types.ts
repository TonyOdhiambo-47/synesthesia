// Shared types for the Synesthesia engine.

export interface Vec2 { x: number; y: number; }

export interface HandPoint {
  // Normalized 0..1 (origin top-left). z is depth (smaller = closer).
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  // Up to two hands. position is the palm centroid, fingertips index 0..4 = thumb..pinky.
  hands: Array<{
    handedness: 'Left' | 'Right';
    position: HandPoint;
    fingertips: HandPoint[]; // length 5
    landmarks: HandPoint[];  // length 21 (MediaPipe order)
    velocity: Vec2;
    openness: number; // 0 = fist, 1 = open palm
    rotation: number; // wrist angle (radians)
  }>;
}

export interface AudioData {
  bass: number;     // 0..1
  mid: number;      // 0..1
  treble: number;   // 0..1
  volume: number;   // 0..1 (RMS)
  centroid: number; // spectral brightness 0..1
  onset: boolean;   // sudden energy spike (clap/beat)
  spectrum: Uint8Array; // raw frequency bins for HUD viz
}

export type GestureName =
  | 'open' | 'fist' | 'pinch' | 'point' | 'three' | 'clap' | 'none';

export interface GestureEvent {
  name: GestureName;
  hand?: 'Left' | 'Right';
  bothHands?: boolean;
  timestamp: number;
}

export interface Palette {
  name: string;
  bg: [number, number, number];     // 0..1 floats
  colors: [number, number, number][]; // five colors
  glow: [number, number, number, number];
}

export type ModeName = 'nebula' | 'mycelium' | 'topology' | 'calligraphy' | 'cosmos';
