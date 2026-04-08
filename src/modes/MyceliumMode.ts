// MYCELIUM — branching organic networks growing from fingertips.
// Each branch is an array of (x, y, age). New branches spawn from active tips.

import { Mode, ModeContext } from './Mode';
import { LINE_VERT, LINE_FRAG } from '../render/shaders';
import type { HandData, AudioData, GestureEvent } from '../utils/types';

interface Branch {
  x: number; y: number;
  vx: number; vy: number;
  age: number;
  alive: boolean;
  prevX: number; prevY: number;
  depth: number;
}

const MAX_BRANCHES = 4000;
const MAX_SEGMENTS = 12000;

export class MyceliumMode extends Mode {
  name = 'Mycelium';
  branches: Branch[] = [];
  // GPU buffer of line segments (positions + age, 2 verts each).
  segmentData = new Float32Array(MAX_SEGMENTS * 2 * 3);
  segmentCount = 0;

  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  vbo: WebGLBuffer | null = null;

  init(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    this.program = ctx.renderer.compile(
      LINE_VERT, LINE_FRAG, ['a_pos', 'a_age'], ['u_young', 'u_old']
    );
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.segmentData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  private spawnBranch(x: number, y: number, vx: number, vy: number, depth = 0) {
    if (this.branches.length >= MAX_BRANCHES) return;
    this.branches.push({
      x, y, vx, vy, prevX: x, prevY: y, age: 0, alive: true, depth
    });
  }

  onGesture(g: GestureEvent, _ctx: ModeContext): void {
    if (g.name === 'clap') {
      // Bloom: spawn extra branches from each existing tip.
      for (let i = 0, n = this.branches.length; i < n; i++) {
        const b = this.branches[i];
        if (!b.alive) continue;
        for (let k = 0; k < 4; k++) {
          const a = Math.random() * Math.PI * 2;
          this.spawnBranch(b.x, b.y, Math.cos(a) * 0.05, Math.sin(a) * 0.05, b.depth + 1);
        }
      }
    }
  }

  update(hands: HandData, audio: AudioData, dt: number, _t: number): void {
    const dtc = Math.min(dt, 0.05);

    // Spawn branches from fingertips at a rate proportional to audio.
    const spawnP = 0.05 + audio.volume * 0.4;
    for (const h of hands.hands) {
      for (const tip of h.fingertips) {
        if (Math.random() < spawnP * 0.4) {
          const a = Math.random() * Math.PI * 2;
          this.spawnBranch(tip.x, tip.y, Math.cos(a) * 0.04, Math.sin(a) * 0.04);
        }
      }
    }

    const branchProb = 0.01 + audio.treble * 0.15; // harmonics → density
    const speed = 0.15 + audio.volume * 0.5;

    for (let i = 0; i < this.branches.length; i++) {
      const b = this.branches[i];
      if (!b.alive) continue;
      b.prevX = b.x; b.prevY = b.y;
      // Slight wandering.
      const ang = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 0.6;
      b.vx = Math.cos(ang) * speed;
      b.vy = Math.sin(ang) * speed;
      b.x += b.vx * dtc;
      b.y += b.vy * dtc;
      b.age += dtc * 0.5;
      if (b.age > 1 || b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) b.alive = false;

      // Stochastic branching.
      if (b.alive && Math.random() < branchProb && b.depth < 8) {
        const a = Math.atan2(b.vy, b.vx) + (Math.random() < 0.5 ? -1 : 1) * 0.7;
        this.spawnBranch(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, b.depth + 1);
      }

      // Push segment to GPU buffer.
      if (this.segmentCount < MAX_SEGMENTS) {
        const o = this.segmentCount * 6;
        this.segmentData[o] = b.prevX;
        this.segmentData[o + 1] = b.prevY;
        this.segmentData[o + 2] = b.age;
        this.segmentData[o + 3] = b.x;
        this.segmentData[o + 4] = b.y;
        this.segmentData[o + 5] = b.age;
        this.segmentCount++;
      }
    }

    // Cull dead branches periodically when list is large.
    if (this.branches.length > 2000) {
      this.branches = this.branches.filter(b => b.alive);
    }
  }

  render(ctx: ModeContext): void {
    const { renderer, palette } = ctx;
    const gl = renderer.gl;
    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.segmentData.subarray(0, this.segmentCount * 6));

    const young = palette.colors[0];
    const old = palette.colors[3];
    gl.uniform3f(this.program.uniforms.u_young, young[0], young[1], young[2]);
    gl.uniform3f(this.program.uniforms.u_old, old[0], old[1], old[2]);

    gl.drawArrays(gl.LINES, 0, this.segmentCount * 2);
    this.segmentCount = 0;
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.program) gl.deleteProgram(this.program.program);
    this.branches = [];
  }
}
