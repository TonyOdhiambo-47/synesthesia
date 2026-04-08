// COSMOS — orbital N-body. Left hand = star (attractor). Right hand = black hole (consumes).
// Reuses Nebula's instanced particle shader.

import { Mode, ModeContext } from './Mode';
import { NEBULA_VERT, NEBULA_FRAG } from '../render/shaders';
import type { HandData, AudioData, GestureEvent } from '../utils/types';
import { clamp } from '../utils/math';

const N = 800;

export class CosmosMode extends Mode {
  name = 'Cosmos';
  posX = new Float32Array(N);
  posY = new Float32Array(N);
  velX = new Float32Array(N);
  velY = new Float32Array(N);
  life = new Float32Array(N);
  size = new Float32Array(N);
  instanceData = new Float32Array(N * 6);
  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  cornerVBO: WebGLBuffer | null = null;
  instanceVBO: WebGLBuffer | null = null;
  audioRef: AudioData | null = null;

  init(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    this.program = ctx.renderer.compile(
      NEBULA_VERT, NEBULA_FRAG,
      ['a_corner', 'a_pos', 'a_vel', 'a_life', 'a_size'],
      ['u_color', 'u_intensity']
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
    const stride = 24;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 16); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 20); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    this.vao = vao;

    // Seed orbital ring.
    for (let i = 0; i < N; i++) this.respawn(i);
  }

  private respawn(i: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.25;
    this.posX[i] = 0.5 + Math.cos(a) * r;
    this.posY[i] = 0.5 + Math.sin(a) * r;
    // Tangential velocity for orbit.
    const speed = 0.3 + Math.random() * 0.2;
    this.velX[i] = -Math.sin(a) * speed;
    this.velY[i] = Math.cos(a) * speed;
    this.life[i] = 1.0;
    this.size[i] = 0.006 + Math.random() * 0.01;
  }

  onGesture(g: GestureEvent, _ctx: ModeContext): void {
    if (g.name === 'clap') {
      // Supernova: kick all particles outward from center.
      for (let i = 0; i < N; i++) {
        const dx = this.posX[i] - 0.5, dy = this.posY[i] - 0.5;
        const d = Math.hypot(dx, dy) + 1e-4;
        this.velX[i] += (dx / d) * 1.2;
        this.velY[i] += (dy / d) * 1.2;
      }
    }
  }

  update(hands: HandData, audio: AudioData, dt: number, _ctx: ModeContext): void {
    this.audioRef = audio;
    const dtc = Math.min(dt, 0.05);
    const left = hands.hands.find(h => h.handedness === 'Left');
    const right = hands.hands.find(h => h.handedness === 'Right');
    const G = 0.25 + audio.bass * 0.6;
    const wind = (audio.bass - audio.treble) * 0.4;

    for (let i = 0; i < N; i++) {
      let vx = this.velX[i], vy = this.velY[i];
      const px = this.posX[i], py = this.posY[i];

      if (left) {
        const dx = left.position.x - px, dy = left.position.y - py;
        const r2 = dx * dx + dy * dy + 0.005;
        const f = G / r2;
        vx += dx * f * dtc;
        vy += dy * f * dtc;
      }
      if (right) {
        const dx = right.position.x - px, dy = right.position.y - py;
        const r2 = dx * dx + dy * dy + 0.002;
        const f = (G * 1.5) / r2;
        vx += dx * f * dtc;
        vy += dy * f * dtc;
        if (r2 < 0.005) { this.respawn(i); continue; }
      } else if (!left) {
        // No hands → orbit center.
        const dx = 0.5 - px, dy = 0.5 - py;
        const r2 = dx * dx + dy * dy + 0.005;
        const f = G / r2;
        vx += dx * f * dtc;
        vy += dy * f * dtc;
      }

      // Solar wind: outward from center scaled by bass-treble.
      const dxc = px - 0.5, dyc = py - 0.5;
      const dc = Math.hypot(dxc, dyc) + 1e-4;
      vx += (dxc / dc) * wind * dtc;
      vy += (dyc / dc) * wind * dtc;

      vx *= 0.995; vy *= 0.995;
      this.posX[i] = px + vx * dtc;
      this.posY[i] = py + vy * dtc;
      this.velX[i] = vx;
      this.velY[i] = vy;

      if (px < -0.2 || px > 1.2 || py < -0.2 || py > 1.2) this.respawn(i);
    }

    const data = this.instanceData;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      data[o] = this.posX[i];
      data[o + 1] = this.posY[i];
      data[o + 2] = this.velX[i];
      data[o + 3] = this.velY[i];
      data[o + 4] = this.life[i];
      data[o + 5] = this.size[i];
    }
  }

  render(ctx: ModeContext): void {
    const { renderer, palette } = ctx;
    const gl = renderer.gl;
    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData);
    const idx = Math.floor(clamp(this.audioRef?.centroid || 0.5, 0, 0.999) * palette.colors.length);
    const c = palette.colors[idx];
    gl.uniform3f(this.program.uniforms.u_color, c[0], c[1], c[2]);
    gl.uniform1f(this.program.uniforms.u_intensity, 1.1 + (this.audioRef?.volume || 0) * 1.5);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.cornerVBO) gl.deleteBuffer(this.cornerVBO);
    if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
    if (this.program) gl.deleteProgram(this.program.program);
  }
}
