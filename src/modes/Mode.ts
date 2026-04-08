import type { HandData, AudioData, GestureEvent, Palette } from '../utils/types';
import type { WebGLRenderer } from '../render/WebGLRenderer';

export interface ModeContext {
  renderer: WebGLRenderer;
  palette: Palette;
  time: number;
}

export abstract class Mode {
  abstract name: string;
  abstract init(ctx: ModeContext): void;
  abstract update(hands: HandData, audio: AudioData, dt: number, time: number): void;
  abstract render(ctx: ModeContext): void;
  destroy(_ctx: ModeContext): void {}
  onGesture(_g: GestureEvent, _ctx: ModeContext): void {}
  onPaletteChange(_ctx: ModeContext): void {}
}
