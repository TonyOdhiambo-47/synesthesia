// NEBULA — 10K instanced particles, gravity wells at hands, curl-noise turbulence,
// audio-modulated emission, framebuffer feedback for trails.

import { Mode, ModeContext } from './Mode';
import { NEBULA_VERT, NEBULA_FRAG } from '../render/shaders';
import type { HandData, AudioData } from '../utils/types';
import { flow, clamp } from '../utils/math';

const PARTICLE_COUNT = 10000;

export class NebulaMode extends Mode {
  name = 'Nebula';
  // Particle SoA buffers.
  posX = new Float32Array(PARTICLE_COUNT);
  posY = new Float32Array(PARTICLE_COUNT);
  velX = new Float32Array(PARTICLE_COUNT);
  velY = new Float32Array(PARTICLE_COUNT);
  life = new Float32Array(PARTICLE_COUNT);
  size = new Float32Array(PARTICLE_COUNT);
  // GPU upload buffer (interleaved per-instance: posX, posY, velX, velY, life, size).
  instanceData = new Float32Array(PARTICLE_COUNT * 6);

  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  instanceVBO: WebGLBuffer | null = null;
  cornerVBO: WebGLBuffer | null = null;
  cursor = 0;
  audioRef: AudioData | null = null;
  handsRef: HandData | null = null;

  init(ctx: ModeContext): void {
    const { renderer } = ctx;
    const gl = renderer.gl;
    this.program = renderer.compile(
      NEBULA_VERT, NEBULA_FRAG,
      ['a_corner', 'a_pos', 'a_vel', 'a_life', 'a_size'],
      ['u_color', 'u_intensity']
    );

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Quad corners (per-vertex).
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.cornerVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerVBO);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Per-instance data.
    this.instanceVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    const stride = 6 * 4;
    // a_pos
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    // a_vel
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(2, 1);
    // a_life
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(3, 1);
    // a_size
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
    this.vao = vao;

    // Initialize: all particles dead.
    for (let i = 0; i < PARTICLE_COUNT; i++) this.life[i] = 0;
  }

  private spawn(x: number, y: number, baseVel: { x: number; y: number }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % PARTICLE_COUNT;
    this.posX[i] = x + (Math.random() - 0.5) * 0.04;
    this.posY[i] = y + (Math.random() - 0.5) * 0.04;
    const ang = Math.random() * Math.PI * 2;
    const sp = 0.05 + Math.random() * 0.15;
    this.velX[i] = Math.cos(ang) * sp + baseVel.x * 0.3;
    this.velY[i] = Math.sin(ang) * sp + baseVel.y * 0.3;
    this.life[i] = 1.0;
    this.size[i] = 0.005 + Math.random() * 0.012;
  }

  update(hands: HandData, audio: AudioData, dt: number, time: number): void {
    this.audioRef = audio;
    this.handsRef = hands;
    const dtc = Math.min(dt, 0.05);

    // Spawn rate: tied to audio volume + presence of hands.
    const spawnRate = (40 + audio.volume * 600) * (hands.hands.length > 0 ? 1.5 : 0.4);
    let spawnBudget = spawnRate * dtc;
    while (spawnBudget > 0 && hands.hands.length > 0) {
      const h = hands.hands[Math.floor(Math.random() * hands.hands.length)];
      const tip = h.fingertips[Math.floor(Math.random() * 5)];
      this.spawn(tip.x, tip.y, h.velocity);
      spawnBudget--;
    }
    if (hands.hands.length === 0) {
      // Ambient spawn near center.
      while (spawnBudget > 0) {
        this.spawn(0.5 + (Math.random() - 0.5) * 0.5, 0.5 + (Math.random() - 0.5) * 0.5, { x: 0, y: 0 });
        spawnBudget--;
      }
    }

    const turbStrength = 0.6 + audio.treble * 1.5;
    const damp = 0.985;
    const G = 0.18 + audio.bass * 0.5;
    const left = hands.hands.find(h => h.handedness === 'Left');
    const right = hands.hands.find(h => h.handedness === 'Right');

    // Physics integration.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (this.life[i] <= 0) continue;
      let vx = this.velX[i], vy = this.velY[i];
      const px = this.posX[i], py = this.posY[i];

      // Gravity wells.
      if (left) {
        const dx = left.position.x - px, dy = left.position.y - py;
        const r2 = dx * dx + dy * dy + 0.01;
        const f = G / r2;
        vx += dx * f * dtc;
        vy += dy * f * dtc;
      }
      if (right) {
        const dx = right.position.x - px, dy = right.position.y - py;
        const r2 = dx * dx + dy * dy + 0.01;
        const f = G / r2;
        vx += dx * f * dtc;
        vy += dy * f * dtc;
      }

      // Curl-noise turbulence.
      const [fx, fy] = flow(px * 4, py * 4, time * 0.5);
      vx += fx * turbStrength * dtc;
      vy += fy * turbStrength * dtc;

      vx *= damp; vy *= damp;
      this.posX[i] = px + vx * dtc;
      this.posY[i] = py + vy * dtc;
      this.velX[i] = vx;
      this.velY[i] = vy;
      this.life[i] -= dtc * (0.25 + audio.mid * 0.3);
      if (this.life[i] < 0) this.life[i] = 0;

      // Wrap softly.
      if (this.posX[i] < -0.1 || this.posX[i] > 1.1 || this.posY[i] < -0.1 || this.posY[i] > 1.1) {
        this.life[i] = 0;
      }
    }

    // Pack instance data.
    const data = this.instanceData;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
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

    // Render particles to current write FBO with additive blending.
    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData);

    // Pick a color from the palette based on audio centroid.
    const audio = this.audioRef;
    const centroid = audio?.centroid || 0.5;
    const idx = Math.floor(clamp(centroid, 0, 0.999) * palette.colors.length);
    const c = palette.colors[idx];
    gl.uniform3f(this.program.uniforms.u_color, c[0], c[1], c[2]);
    gl.uniform1f(this.program.uniforms.u_intensity, 0.7 + (audio?.volume || 0) * 1.5);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, PARTICLE_COUNT);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
    if (this.cornerVBO) gl.deleteBuffer(this.cornerVBO);
    if (this.program) gl.deleteProgram(this.program.program);
  }
}
