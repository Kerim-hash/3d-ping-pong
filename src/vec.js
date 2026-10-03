// Minimal {x, y, z} helpers. Kept free of three.js so physics can run in node.
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const clone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const normalize = (a) => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : vec();
};
export const clampLength = (a, max) => {
  const l = length(a);
  return l > max ? scale(a, max / l) : a;
};
export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
