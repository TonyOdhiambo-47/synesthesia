// CALLIGRAPHY — index-finger ink with stroke width by speed, alpha by volume,
// per-blob color, gravity drip, palm clears canvas. Uses a fixed-size ring
// buffer instead of an Array.shift() queue to keep allocations stable.

import { Mode, ModeContext } from './Mode';
import { STROKE_VERT, STROKE_FRAG } from '../render/shaders';
import type { HandData, AudioData, GestureEvent } from '../utils/types';
import { clamp } from '../utils/math';

const MAX_BLOBS = 6000;
// Per-instance layout: posX, posY, radius, r, g, b, a, age = 8 floats (32 bytes).
const STRIDE_FLOATS = 8;
const STRIDE_BYTES = STRIDE_FLOATS * 4;

export class CalligraphyMode extends Mode {
  name = 'Calligraphy';
  // Ring buffer: head writes, count tracks live entries.
  blobs = new Float32Array(MAX_BLOBS * STRIDE_FLOATS);
  head = 0;
  count = 0;

  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  cornerVBO: WebGLBuffer | null = null;
  instanceVBO: WebGLBuffer | null = null;
  // Compacted upload buffer (only the live tail/head segment in linear order).
  uploadBuf = new Float32Array(MAX_BLOBS * STRIDE_FLOATS);

  brushStyle = 0;
  paletteCursor = 0;
  audioVolume = 0;

  init(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    this.program = ctx.renderer.compile(
      STROKE_VERT, STROKE_FRAG,
      ['a_corner', 'a_pos', 'a_radius', 'a_color', 'a_alpha'],
      []
    );
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.cornerVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerVBO);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instanceVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.uploadBuf.byteLength, gl.DYNAMIC_DRAW);
    // a_pos
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE_BYTES, 0);
    gl.vertexAttribDivisor(1, 1);
    // a_radius
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE_BYTES, 8);
    gl.vertexAttribDivisor(2, 1);
    // a_color
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE_BYTES, 12);
    gl.vertexAttribDivisor(3, 1);
    // a_alpha
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE_BYTES, 24);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
    this.vao = vao;
  }

  onGesture(g: GestureEvent, ctx: ModeContext): void {
    if (g.bothHands) return;
    if (g.name === 'open') {
      // Real clear: drop CPU blobs AND ask the engine to wipe the feedback FBOs.
      this.count = 0;
      this.head = 0;
      ctx.requestClear = true;
    }
    if (g.name === 'fist') this.brushStyle = (this.brushStyle + 1) % 4;
  }

  private push(x: number, y: number, radius: number, c: [number, number, number], alpha: number) {
    const o = this.head * STRIDE_FLOATS;
    this.blobs[o] = x;
    this.blobs[o + 1] = y;
    this.blobs[o + 2] = radius;
    this.blobs[o + 3] = c[0];
    this.blobs[o + 4] = c[1];
    this.blobs[o + 5] = c[2];
    this.blobs[o + 6] = alpha;
    this.blobs[o + 7] = 0; // age
    this.head = (this.head + 1) % MAX_BLOBS;
    if (this.count < MAX_BLOBS) this.count++;
  }

  update(hands: HandData, audio: AudioData, dt: number, ctx: ModeContext): void {
    this.audioVolume = audio.volume;
    const dtc = Math.min(dt, 0.05);
    const palette = ctx.palette.colors;

    for (const h of hands.hands) {
      const tip = h.fingertips[1]; // index
      const speed = Math.hypot(h.velocity.x, h.velocity.y);
      const widthBase = clamp(0.04 - speed * 0.05, 0.005, 0.04);
      const styleScale = [1, 0.6, 1.4, 0.8][this.brushStyle];
      const radius = widthBase * styleScale;
      const alpha = clamp(0.15 + audio.volume * 1.5, 0.15, 1.0);
      const colorIdx = (this.paletteCursor + Math.floor(performance.now() / 800)) % palette.length;
      const c = palette[colorIdx];
      const stamps = 4;
      for (let i = 0; i < stamps; i++) {
        const t = i / stamps;
        this.push(
          tip.x - h.velocity.x * 0.005 * (1 - t),
          tip.y - h.velocity.y * 0.005 * (1 - t),
          radius,
          c,
          alpha
        );
      }
    }

    // Gravity drip — fresh blobs sink slowly. Iterate the ring without allocations.
    const buf = this.blobs;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE_FLOATS;
      const age = buf[o + 7];
      if (age < 1.2) {
        // Use age-stored "vy" implicit; just shift position downward by simple constant.
        buf[o + 1] += 0.0008 * (1 - age / 1.2);
      }
      buf[o + 7] = age + dtc;
    }
  }

  render(ctx: ModeContext): void {
    const { renderer } = ctx;
    const gl = renderer.gl;
    if (this.count === 0) return;

    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);

    // Upload only the live slice. Because the ring may wrap, copy in two halves.
    const live = this.count;
    const start = (this.head - live + MAX_BLOBS) % MAX_BLOBS;
    if (start + live <= MAX_BLOBS) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.blobs.subarray(start * STRIDE_FLOATS, (start + live) * STRIDE_FLOATS));
    } else {
      const tail = MAX_BLOBS - start;
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.blobs.subarray(start * STRIDE_FLOATS, MAX_BLOBS * STRIDE_FLOATS));
      gl.bufferSubData(gl.ARRAY_BUFFER, tail * STRIDE_BYTES, this.blobs.subarray(0, (live - tail) * STRIDE_FLOATS));
    }

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, live);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.paletteCursor++;
  }

  destroy(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.cornerVBO) gl.deleteBuffer(this.cornerVBO);
    if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
    if (this.program) gl.deleteProgram(this.program.program);
    this.count = 0;
    this.head = 0;
  }
}
