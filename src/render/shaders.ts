// All GLSL shader sources kept inline for simple bundling.
// Each shader uses WebGL2 / GLSL ES 3.00.

export const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// --- Feedback (trail persistence): copy previous FBO with decay tint. ---
export const FEEDBACK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_prev;
uniform float u_decay;
uniform vec3 u_bg;
void main() {
  vec4 prev = texture(u_prev, v_uv);
  vec3 c = mix(u_bg, prev.rgb, u_decay);
  outColor = vec4(c, 1.0);
}`;

// --- Bloom / present pass with chromatic aberration + film grain. ---
export const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform float u_time;
uniform float u_bloom;

vec3 sampleBlur(sampler2D t, vec2 uv, float r) {
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      float w = exp(-float(i*i + j*j) * 0.18);
      acc += texture(t, uv + vec2(float(i), float(j)) * r).rgb * w;
      total += w;
    }
  }
  return acc / total;
}

void main() {
  vec2 uv = v_uv;
  // Mild chromatic aberration radial.
  vec2 d = uv - 0.5;
  float aberr = 0.0025 * dot(d, d);
  float r = texture(u_scene, uv + d * aberr).r;
  float g = texture(u_scene, uv).g;
  float b = texture(u_scene, uv - d * aberr).b;
  vec3 base = vec3(r, g, b);

  // Bloom: highpass + blur.
  vec3 blurred = sampleBlur(u_scene, uv, 0.0035);
  vec3 high = max(blurred - 0.35, vec3(0.0));
  vec3 bloom = high * u_bloom;

  vec3 col = base + bloom;

  // Film grain.
  float grain = fract(sin(dot(uv * vec2(12.9898, 78.233) + u_time, vec2(43758.5453, 12345.6789))));
  col += (grain - 0.5) * 0.025;

  // Vignette.
  float v = smoothstep(1.1, 0.4, length(d));
  col *= v;

  outColor = vec4(col, 1.0);
}`;

// --- Nebula particle vertex shader (instanced). ---
export const NEBULA_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;       // -1..1 quad
layout(location = 1) in vec2 a_pos;           // particle position 0..1
layout(location = 2) in vec2 a_vel;           // particle velocity (for stretch)
layout(location = 3) in float a_life;         // 0..1 (1 = fresh)
layout(location = 4) in float a_size;         // size in NDC
out vec2 v_uv;
out float v_life;
out vec2 v_vel;
void main() {
  v_uv = a_corner;
  v_life = a_life;
  v_vel = a_vel;
  vec2 ndc = a_pos * 2.0 - 1.0;
  // Slight motion-blur stretch along velocity.
  vec2 perp = vec2(-a_vel.y, a_vel.x);
  float s = a_size;
  vec2 offset = a_corner.x * (a_vel * 8.0 * s + vec2(s)) + a_corner.y * (perp * s + vec2(0.0, s));
  // Simpler radial sprite:
  offset = a_corner * s;
  gl_Position = vec4(ndc + offset, 0.0, 1.0);
}`;

export const NEBULA_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_life;
in vec2 v_vel;
out vec4 outColor;
uniform vec3 u_color;
uniform float u_intensity;
void main() {
  float r = length(v_uv);
  if (r > 1.0) discard;
  float core = exp(-r * r * 4.0);
  float halo = exp(-r * 1.5) * 0.35;
  float a = (core + halo) * v_life * u_intensity;
  vec3 col = u_color * (1.0 + core * 1.2);
  outColor = vec4(col * a, a);
}`;

// --- Calligraphy ink stroke quad shader (with brush mask). ---
export const STROKE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in float a_radius;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  vec2 ndc = a_pos * 2.0 - 1.0;
  gl_Position = vec4(ndc + a_corner * a_radius, 0.0, 1.0);
}`;

export const STROKE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  float r = length(v_uv);
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 1.6) * u_alpha;
  // Slight feathered edge with ink-pool darkening at center.
  float pool = 1.0 + (1.0 - r) * 0.4;
  outColor = vec4(u_color * pool * a, a);
}`;

// --- Topology mesh shader (height field). ---
export const TOPOLOGY_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_grid;          // grid uv 0..1
out vec2 v_uv;
out float v_height;
uniform vec2 u_handL;
uniform vec2 u_handR;
uniform float u_handLDepth;
uniform float u_handRDepth;
uniform float u_time;
uniform float u_bass;
uniform float u_treble;

float waveAt(vec2 p) {
  float h = 0.0;
  // Hand L well/peak.
  float dL = length(p - u_handL);
  h += sin(dL * 30.0 - u_time * 3.0 - u_bass * 4.0) * exp(-dL * 4.0) * u_handLDepth;
  float dR = length(p - u_handR);
  h += sin(dR * 50.0 - u_time * 5.0 - u_treble * 6.0) * exp(-dR * 5.0) * u_handRDepth;
  // Background ripple.
  h += sin(p.x * 12.0 + u_time) * 0.03;
  h += cos(p.y * 10.0 - u_time * 0.7) * 0.03;
  return h;
}

void main() {
  v_uv = a_grid;
  vec2 p = a_grid;
  float h = waveAt(p);
  v_height = h;
  // Project as oblique 2.5D: shift y by -h.
  vec2 ndc = p * 2.0 - 1.0;
  ndc.y += h * 0.6;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const TOPOLOGY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_height;
out vec4 outColor;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_alpha;
void main() {
  float t = clamp(v_height * 1.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(u_c1, u_c2, t);
  col = mix(col, u_c3, smoothstep(0.6, 1.0, t));
  // Wireframe-ish edge brightening using fwidth.
  float edge = 1.0 - smoothstep(0.0, 0.02, fract(v_uv.x * 64.0) * (1.0 - fract(v_uv.x * 64.0)));
  edge += 1.0 - smoothstep(0.0, 0.02, fract(v_uv.y * 36.0) * (1.0 - fract(v_uv.y * 36.0)));
  col += vec3(edge * 0.05);
  outColor = vec4(col, u_alpha);
}`;

// --- Mycelium line segment shader (drawn as expanded quads). ---
export const LINE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_age;
out float v_age;
void main() {
  v_age = a_age;
  vec2 ndc = a_pos * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const LINE_FRAG = `#version 300 es
precision highp float;
in float v_age;
out vec4 outColor;
uniform vec3 u_young;
uniform vec3 u_old;
void main() {
  vec3 col = mix(u_young, u_old, v_age);
  float alpha = (1.0 - v_age) * 0.9 + 0.1;
  outColor = vec4(col * alpha, alpha);
}`;
