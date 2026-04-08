import type { HandData, AudioData, GestureEvent, Palette } from '../utils/types';
import type { WebGLRenderer } from '../render/WebGLRenderer';

export interface ModeContext {
  renderer: WebGLRenderer;
  palette: Palette;
  time: number;
  // Mode may set this to true to ask the engine to hard-clear both ping-pong FBOs
  // before the next feedback pass. The engine clears it after handling.
  requestClear: boolean;
}

export abstract class Mode {
  abstract name: string;
  abstract init(ctx: ModeContext): void;
  abstract update(hands: HandData, audio: AudioData, dt: number, ctx: ModeContext): void;
  abstract render(ctx: ModeContext): void;
  destroy(_ctx: ModeContext): void {}
  onGesture(_g: GestureEvent, _ctx: ModeContext): void {}
  onPaletteChange(_ctx: ModeContext): void {}
}
