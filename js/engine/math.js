// Small numeric helpers shared by the engine and the scenes.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (v) => clamp(v, 0, 1);

/** GLSL-style smoothstep; works for edge0 > edge1 as well. */
export function smoothstep(e0, e1, x) {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Normalised position of z inside [zA, zB] (zA is the outer level, zB the inner one). */
export const span = (zA, zB, z) => saturate((zA - z) / (zA - zB));

/**
 * Zoom towards a point without a visible pan: the anchor's offset from the view centre,
 * measured in screen units, decays smoothly from its start value to zero.
 * Returns the view centre for normalised progress t, given the start centre c0,
 * the anchor a and the ratio of the current field of view to the starting one.
 */
export function driftCentre(c0, a, t, fovRatio, ease = (x) => x * x * (3 - 2 * x)) {
  const k = (1 - ease(saturate(t))) * fovRatio;
  return c0.map((v, i) => a[i] + (v - a[i]) * k);
}
