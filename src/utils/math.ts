// Math utilities — vectors, noise, easing, mapping.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1) =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const map = (v: number, a: number, b: number, c: number, d: number) =>
  c + ((v - a) / (b - a)) * (d - c);

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt(dist2(ax, ay, bx, by));

// Hash-based pseudo-noise (cheap, deterministic).
export const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// 2D value noise (smooth interpolation over hash grid).
export function noise2(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Curl-noise-like flow vector (for particle advection).
export function flow(x: number, y: number, t: number): [number, number] {
  const e = 0.01;
  const n1 = noise2(x + e, y + t * 0.1);
  const n2 = noise2(x - e, y + t * 0.1);
  const n3 = noise2(x + t * 0.1, y + e);
  const n4 = noise2(x + t * 0.1, y - e);
  return [(n1 - n2) / (2 * e), (n3 - n4) / (2 * e)];
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
