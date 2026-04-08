// CALLIGRAPHY — index-finger ink with stroke width by speed, alpha by volume,
// gravity drip, palm clears canvas.

import { Mode, ModeContext } from './Mode';
import { STROKE_VERT, STROKE_FRAG } from '../render/shaders';
import type { HandData, AudioData, GestureEvent } from '../utils/types';
import { clamp } from '../utils/math';

interface InkBlob {
  x: number; y: number;
  vy: number;
  radius: number;
  alpha: number;
  color: [number, number, number];
  age: number;
}

const MAX_BLOBS = 6000;

export class CalligraphyMode extends Mode {
  name = 'Calligraphy';
  blobs: InkBlob[] = [];
  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  cornerVBO: WebGLBuffer | null = null;
  instanceVBO: WebGLBuffer | null = null;
  instanceData = new Float32Array(MAX_BLOBS * 3); // pos + radius
  brushStyle = 0;
  clearRequested = false;
  paletteCursor = 0;

  init(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    this.program = ctx.renderer.compile(
      STROKE_VERT, STROKE_FRAG,
      ['a_corner', 'a_pos', 'a_radius'],
      ['u_color', 'u_alpha']
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
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  onGesture(g: GestureEvent, _ctx: ModeContext): void {
    if (g.name === 'open' && !g.bothHands) this.clearRequested = true;
    if (g.name === 'fist' && !g.bothHands) this.brushStyle = (this.brushStyle + 1) % 4;
  }

  update(hands: HandData, audio: AudioData, dt: number, _t: number): void {
    if (this.clearRequested) {
      this.blobs = [];
      this.clearRequested = false;
    }
    const dtc = Math.min(dt, 0.05);
    const palette = (this as any)._palette as [number, number, number][];
    for (const h of hands.hands) {
      const tip = h.fingertips[1]; // index
      const speed = Math.hypot(h.velocity.x, h.velocity.y);
      // width: slow = thick, fast = thin (calligraphic).
      const widthBase = clamp(0.04 - speed * 0.05, 0.005, 0.04);
      const styleScale = [1, 0.6, 1.4, 0.8][this.brushStyle];
      const radius = widthBase * styleScale;
      const alpha = clamp(0.15 + audio.volume * 1.5, 0.15, 1.0);
      const c = (palette || [[1, 1, 1]])[(this.paletteCursor + Math.floor(performance.now() / 800)) % (palette?.length || 1)] || [1, 1, 1];
      // Stamp multiple blobs along velocity for smooth strokes.
      const stamps = 4;
      for (let i = 0; i < stamps; i++) {
        const t = i / stamps;
        if (this.blobs.length >= MAX_BLOBS) this.blobs.shift();
        this.blobs.push({
          x: tip.x - h.velocity.x * 0.005 * (1 - t),
          y: tip.y - h.velocity.y * 0.005 * (1 - t),
          vy: 0,
          radius,
          alpha,
          color: [c[0], c[1], c[2]],
          age: 0
        });
      }
    }

    // Gravity drip — fresh blobs sink slowly.
    for (const b of this.blobs) {
      b.age += dtc;
      if (b.age < 1.2) {
        b.vy += 0.05 * dtc;
        b.y += b.vy * dtc;
      }
    }
  }

  render(ctx: ModeContext): void {
    const { renderer, palette } = ctx;
    (this as any)._palette = palette.colors;
    const gl = renderer.gl;
    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);

    // Render blobs in batches grouped roughly by color (simple: per-blob draw — small N).
    // For perf, draw all with one color = palette[0]. For variety, walk colors:
    const data = this.instanceData;
    let n = 0;
    for (const b of this.blobs) {
      data[n * 3] = b.x;
      data[n * 3 + 1] = b.y;
      data[n * 3 + 2] = b.radius;
      n++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 3));

    const c = palette.colors[this.paletteCursor % palette.colors.length];
    gl.uniform3f(this.program.uniforms.u_color, c[0], c[1], c[2]);
    gl.uniform1f(this.program.uniforms.u_alpha, 0.6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

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
    this.blobs = [];
  }
}
