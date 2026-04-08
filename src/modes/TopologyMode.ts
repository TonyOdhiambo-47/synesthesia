// TOPOLOGY — mathematical surface deformed by hand positions/depth.
// A regular grid mesh; vertex shader deforms y by sum-of-radial-waves.

import { Mode, ModeContext } from './Mode';
import { TOPOLOGY_VERT, TOPOLOGY_FRAG } from '../render/shaders';
import type { HandData, AudioData } from '../utils/types';

const GRID_W = 96;
const GRID_H = 56;

export class TopologyMode extends Mode {
  name = 'Topology';
  program: any = null;
  vao: WebGLVertexArrayObject | null = null;
  vbo: WebGLBuffer | null = null;
  ibo: WebGLBuffer | null = null;
  indexCount = 0;

  handL: [number, number] = [0.3, 0.5];
  handR: [number, number] = [0.7, 0.5];
  handLDepth = 0;
  handRDepth = 0;
  bass = 0; treble = 0;

  init(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    this.program = ctx.renderer.compile(
      TOPOLOGY_VERT, TOPOLOGY_FRAG,
      ['a_grid'],
      ['u_handL', 'u_handR', 'u_handLDepth', 'u_handRDepth', 'u_time', 'u_bass', 'u_treble', 'u_c1', 'u_c2', 'u_c3', 'u_alpha']
    );
    // Generate grid vertices.
    const verts = new Float32Array(GRID_W * GRID_H * 2);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const o = (y * GRID_W + x) * 2;
        verts[o] = x / (GRID_W - 1);
        verts[o + 1] = y / (GRID_H - 1);
      }
    }
    // Indices for line mesh (horizontal + vertical lines).
    const idx: number[] = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W - 1; x++) {
        idx.push(y * GRID_W + x, y * GRID_W + x + 1);
      }
    }
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H - 1; y++) {
        idx.push(y * GRID_W + x, (y + 1) * GRID_W + x);
      }
    }
    const indices = new Uint16Array(idx);
    this.indexCount = indices.length;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  update(hands: HandData, audio: AudioData, _dt: number, _t: number): void {
    const left = hands.hands.find(h => h.handedness === 'Left');
    const right = hands.hands.find(h => h.handedness === 'Right');
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    if (left) {
      this.handL[0] = lerp(this.handL[0], left.position.x, 0.2);
      this.handL[1] = lerp(this.handL[1], left.position.y, 0.2);
      this.handLDepth = lerp(this.handLDepth, 0.5 - left.position.y, 0.2);
    } else this.handLDepth *= 0.95;
    if (right) {
      this.handR[0] = lerp(this.handR[0], right.position.x, 0.2);
      this.handR[1] = lerp(this.handR[1], right.position.y, 0.2);
      this.handRDepth = lerp(this.handRDepth, 0.5 - right.position.y, 0.2);
    } else this.handRDepth *= 0.95;
    this.bass = audio.bass;
    this.treble = audio.treble;
  }

  render(ctx: ModeContext): void {
    const { renderer, palette, time } = ctx;
    const gl = renderer.gl;
    renderer.bindFBO(renderer.write());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    const u = this.program.uniforms;
    gl.uniform2f(u.u_handL, this.handL[0], this.handL[1]);
    gl.uniform2f(u.u_handR, this.handR[0], this.handR[1]);
    gl.uniform1f(u.u_handLDepth, this.handLDepth);
    gl.uniform1f(u.u_handRDepth, this.handRDepth);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_bass, this.bass);
    gl.uniform1f(u.u_treble, this.treble);
    const c1 = palette.colors[0], c2 = palette.colors[2], c3 = palette.colors[1];
    gl.uniform3f(u.u_c1, c1[0], c1[1], c1[2]);
    gl.uniform3f(u.u_c2, c2[0], c2[1], c2[2]);
    gl.uniform3f(u.u_c3, c3[0], c3[1], c3[2]);
    gl.uniform1f(u.u_alpha, 0.55);
    gl.drawElements(gl.LINES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  destroy(ctx: ModeContext): void {
    const gl = ctx.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    if (this.program) gl.deleteProgram(this.program.program);
  }
}
