// WebGL2 renderer: shader compilation, FBO ping-pong, fullscreen quad helpers.

export interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  attributes: Record<string, number>;
}

export interface Framebuffer {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class WebGLRenderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  width = 0;
  height = 0;
  dpr = 1;

  // Fullscreen quad VAO.
  quadVAO!: WebGLVertexArrayObject;

  // Ping-pong FBOs for trail feedback.
  fboA!: Framebuffer;
  fboB!: Framebuffer;
  current: 'A' | 'B' = 'A';

  // Whether half-float color buffers are usable; falls back to RGBA8 otherwise.
  hdr = false;
  fboInternalFormat = 0;
  fboType = 0;

  private resizeListener: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 unavailable. Try a modern browser.');
    this.gl = gl;

    // Try float color buffers; fall back to RGBA8 if unsupported (older Safari/iOS).
    const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.hdr = hasFloat;
    this.fboInternalFormat = hasFloat ? gl.RGBA16F : gl.RGBA8;
    this.fboType = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    this.initQuad();
    this.resize();
    this.resizeListener = () => this.resize();
    window.addEventListener('resize', this.resizeListener);
  }

  destroy() {
    const gl = this.gl;
    window.removeEventListener('resize', this.resizeListener);
    if (this.fboA) this.destroyFBO(this.fboA);
    if (this.fboB) this.destroyFBO(this.fboB);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
  }

  // Hard-clear both ping-pong FBOs to a known background color.
  clearFBOs(r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    for (const f of [this.fboA, this.fboB]) {
      if (!f) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.viewport(0, 0, f.width, f.height);
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
  }

  private initQuad() {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.quadVAO = vao;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (w === this.width && h === this.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.gl.viewport(0, 0, w, h);
    this.recreateFBOs();
  }

  private recreateFBOs() {
    if (this.fboA) this.destroyFBO(this.fboA);
    if (this.fboB) this.destroyFBO(this.fboB);
    this.fboA = this.createFBO(this.width, this.height);
    this.fboB = this.createFBO(this.width, this.height);
    // Clear both to black so the very first feedback sample reads defined memory.
    this.clearFBOs(0, 0, 0, 1);
  }

  createFBO(width: number, height: number, internalFormat?: number): Framebuffer {
    const gl = this.gl;
    const fmt = internalFormat ?? this.fboInternalFormat;
    const type = fmt === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      // If half-float failed at runtime (driver lied about extension), retry RGBA8.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      if (fmt !== gl.RGBA8) {
        console.warn('FBO incomplete with float format; falling back to RGBA8.');
        this.hdr = false;
        this.fboInternalFormat = gl.RGBA8;
        this.fboType = gl.UNSIGNED_BYTE;
        return this.createFBO(width, height, gl.RGBA8);
      }
      throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, texture: tex, width, height };
  }

  destroyFBO(f: Framebuffer) {
    this.gl.deleteFramebuffer(f.fbo);
    this.gl.deleteTexture(f.texture);
  }

  compile(vertSrc: string, fragSrc: string, attribs: string[] = [], uniforms: string[] = []): ShaderProgram {
    const gl = this.gl;
    const compileOne = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile error: ${log}\n${src}`);
      }
      return sh;
    };
    const vs = compileOne(gl.VERTEX_SHADER, vertSrc);
    const fs = compileOne(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    attribs.forEach((a, i) => gl.bindAttribLocation(program, i, a));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uMap: Record<string, WebGLUniformLocation | null> = {};
    uniforms.forEach(u => (uMap[u] = gl.getUniformLocation(program, u)));
    const aMap: Record<string, number> = {};
    attribs.forEach(a => (aMap[a] = gl.getAttribLocation(program, a)));
    return { program, uniforms: uMap, attributes: aMap };
  }

  drawFullscreenQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  bindFBO(f: Framebuffer | null) {
    const gl = this.gl;
    if (f) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.viewport(0, 0, f.width, f.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    }
  }

  swap() { this.current = this.current === 'A' ? 'B' : 'A'; }
  read(): Framebuffer { return this.current === 'A' ? this.fboB : this.fboA; }
  write(): Framebuffer { return this.current === 'A' ? this.fboA : this.fboB; }

  clear(r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
