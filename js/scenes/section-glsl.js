// The coated tool in cross-section, as one GLSL function shared by two scenes:
// the ray-marched drill paints it on the wall of the ion-beam trench, and the flat
// microscope scene shows it full screen. Units are micrometres; y = 0 is the surface of
// the tool, y > 0 is vacuum. The coating follows the PVD architecture supplied by the
// author (4.0 µm in total), from the top:
//   (AlCrTiNbV)N 2.7 µm, transition zone 0.2 µm, TiCrAlSiN 1.0 µm (graded), Ti (Cr) 0.1 µm,
// on cemented carbide (tungsten carbide grains in cobalt).

// The zoom centre: the middle of the (AlCrTiNbV)N layer, x = 0 on the cut face.
export const SECTION_CENTRE = [0, -1.35];
export const SECTION_LAYERS = [
  { key: 'top', from: 0, to: -2.7 },
  { key: 'transition', from: -2.7, to: -2.9 },
  { key: 'graded', from: -2.9, to: -3.9 },
  { key: 'adhesion', from: -3.9, to: -4.0 },
];

export const NOISE_GLSL = /* glsl */`
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// fades a feature of size \`size\` out as it gets smaller than a few pixels
float lod(float size, float px) { return smoothstep(1.5, 4.0, size / px); }
`;

export const SECTION_GLSL = /* glsl */`
// ---- geometry of the section, micrometres ----
const float SEC_COAT = 4.0;      // total coating thickness
const float SEC_L1 = -2.7;       // bottom of (AlCrTiNbV)N
const float SEC_L2 = -2.9;       // bottom of the transition zone
const float SEC_L3 = -3.9;       // bottom of TiCrAlSiN, top of the Ti (Cr) adhesion layer
const float SEC_COL = 0.11;      // typical column width in (AlCrTiNbV)N
const float SEC_LAYER = 0.0085;  // bilayer period of the nanolayers
const float SEC_GRAIN = 0.95;    // tungsten carbide grain spacing
const float SEC_LAT = 0.00021;   // projected spacing of atomic columns: half of the 0.42 nm cell
uniform float uSeed;
uniform vec2 uSecCentre;         // the zoom centre inside the coating; layers and lattice are phased to it

const vec3 SEC_GOLD = vec3(1.0, 0.77, 0.40);   // (AlCrTiNbV)N, the gold thread
const vec3 SEC_ROSE = vec3(1.0, 0.70, 0.62);   // transition zone
const vec3 SEC_SAGE = vec3(0.66, 0.92, 0.80);  // TiCrAlSiN
const vec3 SEC_STEEL = vec3(0.76, 0.84, 1.0);  // Ti (Cr)

// Column boundaries run roughly vertically; boundary i sits near (i + 0.5) * width.
float colBoundary(float i, float y, float salt) {
  float h = hash11(i * 7.13 + uSeed + salt);
  float j = (h - 0.5) * 0.62;
  // the two boundaries around the zoom centre are kept regular so the centre sits mid-column
  float calm = (abs(i + 0.5) < 1.0 && salt == 0.0) ? 0.15 : 1.0;
  float wob = 0.07 * sin(y * (1.1 + 2.2 * hash11(i * 3.7 + 1.0 + salt)) + 6.2831 * h) + 0.04 * sin(y * 7.3 + 11.0 * h);
  return (i + 0.5 + (j + wob) * calm);
}

// Columns of width w that nucleate at height base and compete as they grow.
// Returns (index of the column, distance to the nearest boundary, column centre).
vec3 columnAt(vec2 p, float w, float base, float salt) {
  float x = p.x / w;
  float i = floor(x + 0.5);
  float bl = colBoundary(i - 1.0, p.y, salt);
  float br = colBoundary(i, p.y, salt);
  if (x < bl) { i -= 1.0; br = bl; bl = colBoundary(i - 1.0, p.y, salt); }
  else if (x > br) { i += 1.0; bl = br; br = colBoundary(i, p.y, salt); }
  float d = min(x - bl, br - x) * w;
  float hr = hash11(i * 5.31 + 3.0 + uSeed + salt);
  // some columns lose the competition on the way up, most of them close to where they nucleated
  float hcut = base + 0.06 + (hr < 0.55 ? 0.5 * hr : 2.0 * (hr - 0.55) / 0.45 * step(0.25, abs(i)));
  if (p.y < hcut) {
    float mid = mix(bl, br, 0.35 + 0.3 * hash11(i * 9.1 + uSeed + salt));
    d = min(d, abs(x - mid) * w);
    if (x > mid) i += 0.5;
  }
  return vec3(i, d, 0.5 * (bl + br) * w);
}

float sdEqTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float sdBox2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Tungsten carbide grains: mostly truncated triangular prisms cut at random angles, densely
// packed so that the cobalt binder is left in thin films and small pockets.
// Returns (distance to the nearest grain, its id, distance to the second grain).
vec3 carbide(vec2 p) {
  vec2 g = p / SEC_GRAIN;
  vec2 cell = floor(g);
  float d1 = 1e5;
  float d2 = 1e5;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec2 h = hash22(c + uSeed);
      vec2 o = (c + 0.5 + (h - 0.5) * 0.5) * SEC_GRAIN;
      float a = h.x * 6.2831 + h.y * 3.0;
      vec2 q = p - o;
      q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float sz = hash12(c * 1.7 + 4.0 + uSeed);
      float s = SEC_GRAIN * mix(0.46, 0.86, sqrt(sz));
      float kind = hash12(c * 2.3 + 9.0 + uSeed);
      float d;
      if (kind < 0.55) d = max(sdEqTri(q, s), sdEqTri(-q, s * (1.22 + 0.45 * h.y)));
      else if (kind < 0.78) d = sdEqTri(q, s * 0.92);
      else d = sdBox2(q, vec2(s * 0.8, s * (0.28 + 0.34 * h.y)));
      if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 31.0 + uSeed); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(d1, id, d2);
}

// Grey levels of the section. style: 0 = scanning electron microscope, 1 = STEM (Z-contrast).
// Each coating layer carries its own muted tint; the top layer keeps the gold thread.
vec3 sectionColor(vec2 p, float px, float style, vec2 screen) {
  float sem = 1.0 - style;
  float top = 0.012 * (vnoise(vec2(p.x * 3.0, 5.0)) - 0.5);
  // ion-milling curtains: faint vertical streaks
  float curtain = (vnoise(vec2(p.x * 2.6, 0.0)) - 0.5) * 0.05 + (vnoise(vec2(p.x * 9.0, 3.0)) - 0.5) * 0.035 * lod(0.1, px);
  float ifc = -SEC_COAT + 0.04 * (vnoise(vec2(p.x * 2.2, 11.0)) - 0.5);
  float v;
  vec3 tint = vec3(1.0);
  if (p.y > top) {
    // vacuum above the tool; the cut edge glows in the secondary-electron image
    v = 0.065 + 0.02 * sem;
    v += 0.32 * exp(-(p.y - top) / max(px * 2.5, 0.012)) * sem;
  } else if (p.y > ifc) {
    float boundaryL = 1.0;
    float cid;
    float semV;
    float stemV;
    float layer = 0.5;
    vec3 hue = SEC_GOLD;
    float amount = 0.7;
    if (p.y > SEC_L1) {
      // (AlCrTiNbV)N: columns, and inside them alternating nanolayers
      vec3 col = columnAt(p, SEC_COL, SEC_L1, 0.0);
      cid = hash11(col.x * 1.31 + 5.0 + uSeed);
      float u = clamp((p.x - col.z) / (SEC_COL * 0.5), -1.0, 1.0);
      float bowl = 0.006 * (1.0 - u * u);
      // nanolayers bow upwards inside each column, following its growth front
      float yl = p.y - bowl - (uSecCentre.y - 0.006);
      float s = fract(yl / SEC_LAYER + 0.25);
      layer = smoothstep(0.08, 0.2, s) - smoothstep(0.58, 0.7, s);
      boundaryL = 1.0 - smoothstep(0.0, max(0.0015, px * 1.2), col.y);
      semV = 0.5 + (cid - 0.5) * 0.13 * lod(SEC_COL, px) - 0.13 * boundaryL * lod(SEC_COL * 0.5, px);
      semV += 0.03 * (vnoise(vec2(col.x * 3.1, p.y * 2.2)) - 0.5) * lod(SEC_COL, px);
      semV += (layer - 0.5) * 0.08 * lod(SEC_LAYER, px);
      float nuc = smoothstep(SEC_L1 + 0.12, SEC_L1 + 0.03, p.y);
      if (nuc > 0.0) semV += nuc * (hash12(floor(p / 0.03) + 7.0 + uSeed) - 0.5) * 0.1 * lod(0.03, px);
      stemV = mix(0.30, 0.56, layer) * mix(1.0, 0.92 + 0.16 * cid, 0.6);
      stemV -= 0.2 * (1.0 - smoothstep(0.0, max(0.002, px * 1.5), col.y));
      hue = SEC_GOLD;
      amount = 0.72;
    } else if (p.y > SEC_L2) {
      // transition zone: the two compositions alternate in thin layers
      vec3 col = columnAt(p, 0.07, SEC_L2, 17.0);
      cid = hash11(col.x * 1.7 + 9.0 + uSeed);
      float s = fract((p.y - SEC_L2) / 0.025);
      float tl = smoothstep(0.1, 0.25, s) - smoothstep(0.55, 0.7, s);
      boundaryL = 1.0 - smoothstep(0.0, max(0.0015, px * 1.2), col.y);
      semV = 0.46 + (tl - 0.5) * 0.12 * lod(0.025, px) + (cid - 0.5) * 0.06 * lod(0.07, px) - 0.08 * boundaryL * lod(0.035, px);
      stemV = mix(0.32, 0.5, tl);
      hue = SEC_ROSE;
      amount = 0.62;
    } else if (p.y > SEC_L3) {
      // TiCrAlSiN, graded through its thickness: fine, almost featureless grains
      float g = (p.y - SEC_L3) / (SEC_L2 - SEC_L3); // 0 at its bottom, 1 at its top
      vec3 col = columnAt(p, 0.045, SEC_L3, 31.0);
      cid = hash11(col.x * 2.3 + 13.0 + uSeed);
      boundaryL = 1.0 - smoothstep(0.0, max(0.001, px * 1.2), col.y);
      semV = mix(0.36, 0.44, g) + (cid - 0.5) * 0.07 * lod(0.045, px) - 0.06 * boundaryL * lod(0.025, px);
      semV += (hash12(floor(p / 0.012) + 3.0 + uSeed) - 0.5) * 0.05 * lod(0.012, px);
      stemV = mix(0.3, 0.4, g);
      hue = SEC_SAGE;
      amount = mix(0.3, 0.68, g);
    } else {
      // Ti (Cr) adhesion layer: a thin metallic band
      cid = 0.5;
      semV = 0.62 + (vnoise(p * 40.0) - 0.5) * 0.06 * lod(0.03, px);
      stemV = 0.62;
      hue = SEC_STEEL;
      amount = 0.6;
    }
    semV += curtain;
    // atomic columns appear as soft spots once they are several pixels apart
    float atomVis = smoothstep(4.0, 7.0, SEC_LAT / px) * style;
    if (atomVis > 0.0) {
      vec2 q = (p - uSecCentre) / SEC_LAT;
      vec2 cellA = floor(q + 0.5);
      vec2 f = q - cellA;
      float occ = hash12(cellA + 101.0 + uSeed);
      float bright = mix(0.55, 1.0, layer) * (0.8 + 0.35 * occ);
      float spot = exp(-dot(f, f) * 14.0) * bright;
      stemV = mix(stemV, 0.08 + spot * 0.82, atomVis);
    }
    v = mix(semV, stemV, style);
    tint = mix(vec3(1.0), hue, amount) * mix(1.0, 1.1, amount);
    // thin bright lines where one layer meets the next, as the electron image shows them
    float edgeW = max(px * 1.5, 0.008);
    v += 0.05 * sem * (exp(-abs(p.y - SEC_L1) / edgeW) + exp(-abs(p.y - SEC_L2) / edgeW) + exp(-abs(p.y - ifc) / edgeW));
  } else {
    // cemented carbide: bright WC grains in a darker cobalt binder
    vec3 wc = carbide(p);
    float aa = max(px, 0.004);
    float inG = 1.0 - smoothstep(-aa, aa, wc.x);
    float gb = 1.0 - smoothstep(0.0, aa * 1.5, wc.z - wc.x);
    v = mix(0.27, 0.70 + (wc.y - 0.5) * 0.14, inG);
    v -= 0.12 * gb * inG * lod(SEC_GRAIN * 0.2, px);
    v += 0.1 * exp(-abs(wc.x) / max(aa * 2.0, 0.02)) * sem;
    v += 0.04 * (vnoise(p * 9.0) - 0.5);
    // grains smaller than a few pixels average out instead of sparkling
    v = mix(0.5 + (vnoise(p * 1.3) - 0.5) * 0.05, v, smoothstep(3.0, 8.0, SEC_GRAIN * 0.5 / px));
    v += curtain;
    v = mix(v, v * 0.7 + 0.04, style);
    tint = vec3(0.97, 0.99, 1.02);
  }
  // detector noise, in screen space
  float n = hash12(screen + floor(uSeed * 13.0)) - 0.5;
  v += n * mix(0.06, 0.05, style);
  v = clamp(v, 0.0, 1.0);
  return v * tint;
}
`;
