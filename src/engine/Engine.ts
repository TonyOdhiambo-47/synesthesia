// Engine: render loop, FBO ping-pong, mode/palette state, gesture routing.

import { WebGLRenderer } from '../render/WebGLRenderer';
import { QUAD_VERT, FEEDBACK_FRAG, PRESENT_FRAG } from '../render/shaders';
import { Mode, ModeContext } from '../modes/Mode';
import { NebulaMode } from '../modes/NebulaMode';
import { MyceliumMode } from '../modes/MyceliumMode';
import { TopologyMode } from '../modes/TopologyMode';
import { CalligraphyMode } from '../modes/CalligraphyMode';
import { CosmosMode } from '../modes/CosmosMode';
import { PALETTES } from '../utils/palettes';
import type { HandData, AudioData, GestureEvent, Palette } from '../utils/types';
import { HandTracker } from '../input/HandTracker';
import { AudioAnalyzer } from '../input/AudioAnalyzer';
import { GestureClassifier } from '../input/GestureClassifier';

export interface EngineCallbacks {
  onModeChange?: (name: string) => void;
  onPaletteChange?: (name: string) => void;
  onFps?: (fps: number) => void;
  onAudio?: (audio: AudioData) => void;
}

export class Engine {
  renderer: WebGLRenderer;
  modes: Mode[] = [];
  modeIndex = 0;
  paletteIndex = 0;
  hands: HandTracker | null = null;
  audio: AudioAnalyzer;
  gesture = new GestureClassifier();
  feedbackProgram: any;
  presentProgram: any;
  startTime = performance.now();
  lastFrame = performance.now();
  fpsAcc = 0;
  fpsCount = 0;
  cb: EngineCallbacks;
  galleryMode = false;
  galleryTimer = 0;
  running = false;
  decay = 0.97;
  noCamera = false;
  syntheticHands: HandData = { hands: [] };
  ctxStash!: ModeContext;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks = {}) {
    this.renderer = new WebGLRenderer(canvas);
    this.cb = cb;
    this.audio = new AudioAnalyzer();

    this.feedbackProgram = this.renderer.compile(
      QUAD_VERT, FEEDBACK_FRAG, ['a_pos'], ['u_prev', 'u_decay', 'u_bg']
    );
    this.presentProgram = this.renderer.compile(
      QUAD_VERT, PRESENT_FRAG, ['a_pos'], ['u_scene', 'u_time', 'u_bloom']
    );

    this.modes = [
      new NebulaMode(),
      new MyceliumMode(),
      new TopologyMode(),
      new CalligraphyMode(),
      new CosmosMode()
    ];
    const ctx: ModeContext = { renderer: this.renderer, palette: PALETTES[0], time: 0, requestClear: false };
    this.ctxStash = ctx;
    for (const m of this.modes) m.init(ctx);
    this.cb.onModeChange?.(this.modes[0].name);
    this.cb.onPaletteChange?.(PALETTES[0].name);
  }

  private starting = false;
  private started = false;
  private rafId = 0;
  private screenshotResolver: ((url: string) => void) | null = null;

  async start(opts: { camera: boolean; mic: boolean }) {
    if (this.starting || this.started) return;
    this.starting = true;
    this.noCamera = !opts.camera;
    if (opts.camera) {
      this.hands = new HandTracker();
      try { await this.hands.init(); } catch (e) {
        console.warn('Hands init failed', e);
        this.hands?.destroy();
        this.hands = null;
        this.noCamera = true;
      }
    }
    if (opts.mic) {
      try { await this.audio.init(); } catch (e) { console.warn('Audio init failed', e); }
    }
    this.running = true;
    this.started = true;
    this.starting = false;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  destroy() {
    this.stop();
    try { this.hands?.destroy(); } catch { /* ignore */ }
    try { this.audio.destroy(); } catch { /* ignore */ }
    for (const m of this.modes) {
      try { m.destroy(this.ctxStash); } catch { /* ignore */ }
    }
    try {
      this.renderer.gl.deleteProgram(this.feedbackProgram.program);
      this.renderer.gl.deleteProgram(this.presentProgram.program);
    } catch { /* ignore */ }
    this.renderer.destroy();
    this.started = false;
  }

  private tick = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const time = (now - this.startTime) / 1000;

    // FPS.
    this.fpsAcc += dt; this.fpsCount++;
    if (this.fpsAcc > 0.5) {
      const fps = this.fpsCount / this.fpsAcc;
      this.cb.onFps?.(fps);
      this.fpsAcc = 0; this.fpsCount = 0;
    }

    // Gather inputs.
    const handData: HandData = this.hands ? this.hands.read() : this.syntheticHands;
    const audioData = this.audio.update();
    this.cb.onAudio?.(audioData);

    // Gestures. Sort dual-hand events first so a "both fists → next mode"
    // is processed before stale per-hand fists from the same frame.
    if (handData.hands.length > 0) {
      const events = this.gesture.classify(handData);
      events.sort((a, b) => Number(!!b.bothHands) - Number(!!a.bothHands));
      let modeChanged = false;
      for (const ev of events) {
        if (modeChanged && !ev.bothHands) continue; // drop stale per-hand events
        const before = this.modeIndex;
        this.handleGesture(ev);
        if (this.modeIndex !== before) modeChanged = true;
      }
    }

    // Gallery mode auto-cycling.
    if (this.galleryMode) {
      this.galleryTimer += dt;
      if (this.galleryTimer > 30) {
        this.galleryTimer = 0;
        this.cycleMode();
        if (Math.random() < 0.5) this.cyclePalette();
      }
    }

    // Active mode update + render.
    const ctx = this.ctxStash;
    ctx.palette = PALETTES[this.paletteIndex];
    ctx.time = time;
    const mode = this.modes[this.modeIndex];
    mode.update(handData, audioData, dt, ctx);

    // Honor a clear request from the mode (e.g. Calligraphy palm gesture).
    if (ctx.requestClear) {
      const bg = ctx.palette.bg;
      this.renderer.clearFBOs(bg[0], bg[1], bg[2], 1);
      ctx.requestClear = false;
    }

    // Step 1: feedback decay copy of previous frame into write FBO.
    this.renderer.bindFBO(this.renderer.write());
    const gl = this.renderer.gl;
    gl.useProgram(this.feedbackProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderer.read().texture);
    gl.uniform1i(this.feedbackProgram.uniforms.u_prev, 0);
    gl.uniform1f(this.feedbackProgram.uniforms.u_decay, this.decay);
    const bg = ctx.palette.bg;
    gl.uniform3f(this.feedbackProgram.uniforms.u_bg, bg[0], bg[1], bg[2]);
    this.renderer.drawFullscreenQuad();

    // Step 2: render mode on top of decayed frame.
    mode.render(ctx);

    // Step 3: present write FBO to screen with bloom + grain.
    this.renderer.bindFBO(null);
    this.renderer.clear(0, 0, 0, 1);
    gl.useProgram(this.presentProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderer.write().texture);
    gl.uniform1i(this.presentProgram.uniforms.u_scene, 0);
    gl.uniform1f(this.presentProgram.uniforms.u_time, time);
    gl.uniform1f(this.presentProgram.uniforms.u_bloom, 1.0);
    this.renderer.drawFullscreenQuad();

    this.renderer.swap();

    // If a screenshot was requested, capture the canvas now (post-present, pre-clear).
    if (this.screenshotResolver) {
      try { this.screenshotResolver(this.renderer.canvas.toDataURL('image/png')); }
      finally { this.screenshotResolver = null; }
    }

    if (this.running) this.rafId = requestAnimationFrame(this.tick);
  };

  handleGesture(ev: GestureEvent) {
    if (ev.bothHands && ev.name === 'fist') { this.cycleMode(); return; }
    if (ev.bothHands && ev.name === 'clap') {
      this.modes[this.modeIndex].onGesture(ev, this.ctxStash);
      return;
    }
    this.modes[this.modeIndex].onGesture(ev, this.ctxStash);
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % this.modes.length;
    this.cb.onModeChange?.(this.modes[this.modeIndex].name);
  }
  setMode(i: number) {
    if (i < 0 || i >= this.modes.length) return;
    this.modeIndex = i;
    this.cb.onModeChange?.(this.modes[this.modeIndex].name);
  }
  cyclePalette() {
    this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length;
    this.cb.onPaletteChange?.(PALETTES[this.paletteIndex].name);
  }
  toggleGallery() { this.galleryMode = !this.galleryMode; this.galleryTimer = 0; }

  // Mouse-driven synthetic hand for keyboard-only mode.
  setSyntheticHand(x: number, y: number, present: boolean) {
    if (!present) { this.syntheticHands = { hands: [] }; return; }
    const fingertips = Array.from({ length: 5 }, () => ({ x, y, z: 0 }));
    const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
    this.syntheticHands = {
      hands: [{
        handedness: 'Right',
        position: { x, y, z: 0 },
        fingertips,
        landmarks,
        velocity: { x: 0, y: 0 },
        openness: 0.8,
        rotation: 0
      }]
    };
  }

  // Capture canvas as PNG. Because preserveDrawingBuffer is off, we wait for the
  // very next rendered frame and read it before the browser composites/clears.
  screenshot(): Promise<string> {
    return new Promise(resolve => { this.screenshotResolver = resolve; });
  }
}
