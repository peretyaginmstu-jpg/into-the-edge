// Ray-marched drill bit: a solid carbide twist drill, Ø 8 mm, lying on an outlined palm.
// Units are millimetres; the drill axis is +z with the point at z ≈ 0 and the palm below at y = -4.

import { NOISE_GLSL, SECTION_GLSL } from './section-glsl.js';

export const DRILL_VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const DRILL_FS = /* glsl */`
precision highp float;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalf;
uniform float uOrtho;
uniform float uFovMM;
uniform float uTime;
uniform vec2 uHandC;
uniform vec2 uHandR;
uniform vec2 uHandU;
uniform float uHandAlpha;
uniform vec3 uAnchor;
uniform vec3 uT1;
uniform vec3 uN;
uniform vec3 uT2;
uniform float uMill;      // progress of the ion-beam cut, 0..1
uniform float uBeam;
uniform vec2 uBeamPos;    // beam spot: x along the edge, and the milling front (µm)
uniform float uWallView;  // 1 once we look straight at the exposed wall
uniform float uMaxDist;
uniform int uSteps;
uniform float uGrind;
uniform float uDebug;

${NOISE_GLSL}
${SECTION_GLSL}

const float PI = 3.14159265;
const float R = 4.0;
const float LEN = 100.0;
const float FLUTE_LEN = 55.0;
const float WEB = 0.6;
const vec2 FC = vec2(3.968, 1.444);
const float FR = 3.622;
const float CLEAR = 0.11;
const float HONE = 0.025;
const float TWIST = 0.1443;
const float ZC = -1.44;
const float K = 0.36397;
const float B1 = 0.1763;
const float B2 = 0.75;
const float S2 = 0.5;
const float GROUND = -4.0;

// The ion-beam pit, in micrometres, on the flat clearance face 70 µm behind the cutting edge.
const float PIT_W = 30.0;    // half width along the edge
const float PIT_L = 45.0;    // length, from the exposed wall towards the edge
const float PIT_D = 18.0;    // final depth at the wall
const float PIT_RAMP = 0.72; // the floor rises away from the wall, as in a cross-section cut
const float PASSES = 9.0;    // the beam takes the material away pass by pass
const float COAT_END = -62.0; // the PVD coating stops where the shank begins

float opRoundMax(float a, float b, float r) {
  vec2 u = max(vec2(r + a, r + b), 0.0);
  return min(-r, max(a, b)) + length(u);
}
float sdBox3(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Cross-section of the fluted body at the reference orientation. fl = 1 in the fluted part.
float sdSection(vec2 p, float fl) {
  float r = length(p);
  float a = mod(atan(p.y, p.x), PI) * 57.29578;
  float margin = smoothstep(157.0, 161.4, a) * (1.0 - smoothstep(176.5, 179.5, a));
  float outer = r - (R - CLEAR * (1.0 - margin) * fl);
  vec2 fc = FC + normalize(FC) * (1.0 - fl) * 3.6;
  float f2 = max(-(p.y + WEB), length(p - fc) - FR);
  float f1 = max(p.y - WEB, length(p + fc) - FR);
  float d = opRoundMax(outer, -f2, 0.02);
  return opRoundMax(d, -f1, 0.02);
}

float sdBody(vec3 p) {
  // the plain cylindrical shank needs no twist
  if (p.z < -FLUTE_LEN - 6.2) return opRoundMax(length(p.xy) - R, -(p.z + LEN), 0.35);
  float fl = 1.0 - smoothstep(-FLUTE_LEN, -FLUTE_LEN - 6.0, p.z);
  float th = (p.z - ZC) * TWIST;
  float c = cos(th);
  float s = sin(th);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  float d = sdSection(q, fl);
  return opRoundMax(d, -(p.z + LEN), 0.35);
}

// Four-facet point, 140°: primary and secondary clearance faces on each land.
float facet(vec3 p, vec3 n, float c) { return (dot(n, p) - c) / length(n); }
float sdPoint(vec3 p, out float which) {
  which = 0.0;
  if (p.z < -3.0) return -1e3; // far behind the point the facets play no part
  float c2 = B2 * (WEB + S2) - B1 * S2;
  float f1a = facet(p, vec3(K, -B1, 1.0), B1 * WEB);
  float f2a = facet(p, vec3(-K, B1, 1.0), B1 * WEB);
  float f1b = facet(p, vec3(K, -B2, 1.0), c2);
  float f2b = facet(p, vec3(-K, B2, 1.0), c2);
  float d = opRoundMax(f1a, f2a, 0.03);
  which = 0.0;
  if (f1b > d) { d = f1b; which = 1.0; }
  if (f2b > d) { d = f2b; which = 1.0; }
  return d;
}

vec3 toTrench(vec3 p) {
  vec3 d = (p - uAnchor) * 1000.0;
  return vec3(dot(d, uT1), dot(d, uN), dot(d, uT2));
}

// Space above the floor once the pit has been milled to fraction c of its final depth.
float pitAbove(vec3 q, float c) {
  float k = PIT_D * c * PIT_RAMP / PIT_L;
  return -(q.y + PIT_D * c - k * q.z) / sqrt(1.0 + k * k);
}
float pitCover(float m) { return min(1.0, m / PASSES); }
// The removed volume (µm). Every pass deepens the whole pit a little; the pass in progress
// has reached the milling front, which sweeps from the far end towards the wall.
float sdPit(vec3 q) {
  float m = uMill * PASSES;
  float k0 = floor(m);
  float f = m - k0;
  vec2 e = vec2(abs(q.x) - PIT_W, abs(q.z - 0.5 * PIT_L) - 0.5 * PIT_L);
  float prism = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  // before the first pass is complete nothing is removed yet (and nothing may touch the surface)
  float done = k0 > 0.0 ? max(prism, pitAbove(q, pitCover(k0))) : 1e5;
  float front = PIT_L * (1.0 - f);
  float pass = max(max(prism, front - q.z), pitAbove(q, pitCover(k0 + 1.0)));
  return min(done, pass);
}

// material: 0 coating (or bare shank), 2 cut face (shows the section)
float map(vec3 p, out float mat) {
  float which;
  float db = sdBody(p);
  float dp = sdPoint(p, which);
  float d = opRoundMax(db, dp, HONE);
  mat = 0.0;
  if (uMill > 0.0) {
    float dt = sdPit(toTrench(p)) * 0.001;
    if (-dt > d) { d = -dt; mat = 2.0; }
  }
  return d;
}
float mapD(vec3 p) { float m; return map(p, m); }

vec3 calcNormal(vec3 p, float h) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapD(p + k.xyy * h) + k.yyx * mapD(p + k.yyx * h) +
                   k.yxy * mapD(p + k.yxy * h) + k.xxx * mapD(p + k.xxx * h));
}

// Studio lighting, fixed to the camera like the illumination of a microscope.
float softbox(vec3 d, vec3 axis, vec2 size, float soft) {
  float k = dot(d, axis);
  if (k <= 0.0) return 0.0;
  vec3 t = normalize(cross(axis, vec3(0.0, 1.0, 0.0001)));
  vec3 b = cross(t, axis);
  vec2 uv = vec2(dot(d, t), dot(d, b)) / k;
  vec2 q = abs(uv) - size;
  float e = max(q.x, q.y);
  return 1.0 - smoothstep(-soft, soft, e);
}
vec3 studio(vec3 d, float rough) {
  float s = 0.04 + rough * 0.5;
  // dark backdrop, a soft overhead dome and a dim floor
  vec3 c = mix(vec3(0.020, 0.020, 0.022), vec3(0.20, 0.195, 0.19), smoothstep(-0.15, 0.9, d.y));
  c *= 0.55 + 0.45 * smoothstep(-0.6, 0.6, d.z);
  // large key softbox, upper left in front
  c += vec3(2.6, 2.5, 2.35) * softbox(d, normalize(vec3(-0.5, 0.55, 0.67)), vec2(0.75, 0.42), s);
  // tall strip light behind on the right for the rim
  c += vec3(2.1, 2.1, 2.2) * softbox(d, normalize(vec3(0.88, 0.16, -0.45)), vec2(0.12, 1.1), s * 0.8);
  // overhead strip
  c += vec3(1.1) * softbox(d, normalize(vec3(0.05, 0.98, -0.18)), vec2(1.0, 0.09), s);
  // white card low in front
  c += vec3(0.85, 0.83, 0.8) * softbox(d, normalize(vec3(0.2, -0.38, 0.9)), vec2(1.1, 0.36), s);
  // big diffuser behind the camera: faces turned towards us read as gold, not black
  c += vec3(0.62, 0.6, 0.57) * softbox(d, normalize(vec3(-0.05, 0.2, 1.0)), vec2(0.95, 0.6), 0.35 + s);
  return c;
}
vec3 toCam(vec3 v) { return vec3(dot(v, uCamRight), dot(v, uCamUp), -dot(v, uCamFwd)); }
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n, float scale) {
  float occ = 0.0;
  float w = 1.0;
  for (int i = 1; i <= 3; i++) {
    float h = scale * float(i) * 1.3;
    occ += w * (h - mapD(p + n * h));
    w *= 0.6;
  }
  return clamp(1.0 - 1.6 * occ / scale, 0.25, 1.0);
}

float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 36; i++) {
    float h = mapD(ro + rd * t);
    res = min(res, k * h / t);
    t += clamp(h, 0.08, 4.0);
    if (res < 0.02 || t > 40.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float sdUnevenCapsule(vec2 p, vec2 pa, vec2 pb, float ra, float rb) {
  p -= pa;
  pb -= pa;
  float h = dot(pb, pb);
  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
  q.x = abs(q.x);
  float b = ra - rb;
  vec2 c = vec2(sqrt(h - b * b), b);
  float k = c.x * q.y - c.y * q.x;
  float m = dot(c, q);
  float n = dot(q, q);
  if (k < 0.0) return sqrt(h * n) - ra;
  if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
  return m - ra;
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float sdRoundBox2(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
// A relaxed right hand, palm up, fingers along +y, thumb along +x. Millimetres.
float sdHand(vec2 p) {
  vec2 pp = p;
  pp.x *= 1.0 + 0.1 * smoothstep(-40.0, 30.0, p.y);
  float palm = sdRoundBox2(pp - vec2(0.0, -2.0), vec2(37.0, 46.0), 17.0);
  float wrist = sdUnevenCapsule(p, vec2(-2.0, -30.0), vec2(-6.0, -190.0), 31.0, 29.0);
  float d = smin(palm, wrist, 14.0);
  float thenar = sdUnevenCapsule(p, vec2(22.0, -24.0), vec2(44.0, 8.0), 19.0, 12.5);
  float th1 = sdUnevenCapsule(p, vec2(44.0, 8.0), vec2(61.0, 37.0), 11.6, 10.2);
  float th2 = sdUnevenCapsule(p, vec2(61.0, 37.0), vec2(71.0, 62.0), 10.2, 8.4);
  d = smin(d, smin(thenar, min(th1, th2), 3.0), 9.0);
  float f = sdUnevenCapsule(p, vec2(25.0, 38.0), vec2(34.0, 110.0), 9.8, 7.7);
  f = min(f, sdUnevenCapsule(p, vec2(7.5, 42.0), vec2(9.5, 124.0), 10.2, 8.1));
  f = min(f, sdUnevenCapsule(p, vec2(-10.0, 40.0), vec2(-16.0, 116.0), 9.7, 7.6));
  f = min(f, sdUnevenCapsule(p, vec2(-26.5, 31.0), vec2(-39.0, 89.0), 8.7, 6.6));
  return smin(d, f, 7.0);
}

float dot2(vec2 v) { return dot(v, v); }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
// Unsigned distance to a quadratic Bézier curve (after Inigo Quilez).
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A;
  vec2 b = A - 2.0 * B + C;
  vec2 c = a * 2.0;
  vec2 d = A - pos;
  float kk = 1.0 / dot(b, b);
  float kx = kk * dot(a, b);
  float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
  float kz = kk * dot(d, a);
  float res;
  float p = ky - kx * kx;
  float p3 = p * p * p;
  float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
  float h = q * q + 4.0 * p3;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0;
    vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
    res = dot2(d + (c + b * t) * t);
  } else {
    float z = sqrt(-p);
    float v = acos(q / (p * z * 2.0)) / 3.0;
    float m = cos(v);
    float n = sin(v) * 1.732050808;
    vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    res = min(dot2(d + (c + b * t.x) * t.x), dot2(d + (c + b * t.y) * t.y));
  }
  return sqrt(res);
}
float fingerCreases(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ax = b - a;
  vec2 nrm = normalize(vec2(-ax.y, ax.x));
  float d = 1e5;
  for (int i = 0; i < 3; i++) {
    float t = i == 0 ? 0.06 : (i == 1 ? 0.42 : 0.7);
    vec2 c = a + ax * t;
    float w = mix(ra, rb, t) * 0.72;
    d = min(d, sdSeg(p, c - nrm * w, c + nrm * w));
  }
  return d;
}
// Palm lines and the creases of the finger joints, in the hand's own frame.
float handCreases(vec2 p) {
  float d = sdBezier(p, vec2(-37.0, 21.0), vec2(-10.0, 31.0), vec2(17.0, 36.0));   // heart line
  d = min(d, sdBezier(p, vec2(30.0, 13.0), vec2(2.0, 9.0), vec2(-31.0, -6.0)));    // head line
  d = min(d, sdBezier(p, vec2(29.0, 15.0), vec2(6.0, -6.0), vec2(14.0, -44.0)));   // life line
  d = min(d, fingerCreases(p, vec2(25.0, 38.0), vec2(34.0, 110.0), 9.8, 7.7));
  d = min(d, fingerCreases(p, vec2(7.5, 42.0), vec2(9.5, 124.0), 10.2, 8.1));
  d = min(d, fingerCreases(p, vec2(-10.0, 40.0), vec2(-16.0, 116.0), 9.7, 7.6));
  d = min(d, fingerCreases(p, vec2(-26.5, 31.0), vec2(-39.0, 89.0), 8.7, 6.6));
  d = min(d, sdSeg(p, vec2(55.5, 33.0), vec2(66.0, 40.5)));                         // thumb joint
  d = min(d, sdSeg(p, vec2(40.0, 13.0), vec2(51.0, 4.0)));                          // thumb base
  return d;
}

void main() {
  float ref = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / ref;
  vec3 dir = normalize(uCamFwd + (1.0 - uOrtho) * 2.0 * uTanHalf * (uv.x * uCamRight + uv.y * uCamUp));
  vec3 ro = uCamPos + uOrtho * uFovMM * (uv.x * uCamRight + uv.y * uCamUp);
  float pixAng = (1.0 - uOrtho) * 2.0 * uTanHalf / ref;
  float pixLin = uOrtho * uFovMM / ref;

  // background: near-black with a faint warm falloff
  vec2 vv = gl_FragCoord.xy / uRes - 0.5;
  vec3 col = vec3(0.043, 0.046, 0.052) * (1.0 - 0.55 * dot(vv, vv));
  vec3 vacuum = vec3(sectionColor(vec2(0.0, 40.0), 0.05, 0.0, gl_FragCoord.xy));
  col = mix(col, vacuum, uWallView);

  // bounding cylinder around the drill
  float tmin = 1e9;
  float tmax = -1.0;
  {
    vec2 o = ro.xy;
    vec2 d2 = dir.xy;
    float rb = R + 0.004;
    float a = dot(d2, d2);
    float b = dot(o, d2);
    float c = dot(o, o) - rb * rb;
    float disc = b * b - a * c;
    if (disc > 0.0 && a > 1e-12) {
      float sq = sqrt(disc);
      float t0 = (-b - sq) / a;
      float t1 = (-b + sq) / a;
      float zLo = -LEN - 0.05;
      float zHi = 0.25;
      if (abs(dir.z) > 1e-9) {
        float tz0 = (zLo - ro.z) / dir.z;
        float tz1 = (zHi - ro.z) / dir.z;
        t0 = max(t0, min(tz0, tz1));
        t1 = min(t1, max(tz0, tz1));
      } else if (ro.z < zLo || ro.z > zHi) {
        t1 = -1.0;
      }
      tmin = max(t0, 0.0);
      tmax = min(t1, uMaxDist);
    } else if (a <= 1e-12 && c < 0.0) {
      tmin = 0.0;
      tmax = uMaxDist;
    }
  }

  float hitT = -1.0;
  float mat = 0.0;
  if (tmax > tmin) {
    // over-relaxed sphere tracing (Keinert et al. 2014) with a fallback when it overshoots
    float t = tmin;
    float omega = 1.5;
    float prevR = 0.0;
    float stepLen = 0.0;
    for (int i = 0; i < 200; i++) {
      if (i >= uSteps) break;
      float m;
      float d = map(ro + dir * t, m) * 0.86;
      float r = abs(d);
      bool fail = omega > 1.0 && (r + prevR) < stepLen;
      if (fail) {
        stepLen -= omega * stepLen;
        omega = 1.0;
      } else {
        stepLen = d * omega;
        mat = m;
        float eps = pixLin + pixAng * t;
        if (d < 0.4 * eps) { hitT = t; break; }
      }
      prevR = r;
      t += stepLen;
      if (t > tmax) break;
    }
  }

  // ground plane with the outlined palm
  float tg = (dir.y < -1e-6) ? (GROUND - ro.y) / dir.y : -1.0;
  if (hitT < 0.0 && tg > 0.0 && uHandAlpha > 0.001 && tg < uMaxDist) {
    vec3 g = ro + dir * tg;
    vec2 gp = g.xz - uHandC;
    vec2 hp = vec2(dot(gp, uHandR), dot(gp, uHandU));
    float sd = sdHand(hp);
    float px = pixLin + pixAng * tg;
    float line = 1.0 - smoothstep(0.55 * px, 1.35 * px, abs(sd));
    float inside = 1.0 - smoothstep(-px, px, sd);
    vec3 ground = col;
    ground = mix(ground, vec3(0.083, 0.082, 0.082), inside * 0.92);
    // the drill rests on the palm; a soft shadow falls away from the key light
    float axisDist = length(vec2(g.x, max(0.0, g.z) + min(0.0, g.z + LEN)));
    if (axisDist < 22.0) {
      float sh = softShadow(g, normalize(vec3(0.62, 1.0, -0.2)), 7.0);
      float contact = smoothstep(4.2, 6.5, axisDist);
      ground *= mix(0.28, 1.0, sh) * mix(0.6, 1.0, contact);
    }
    // palm lines and finger creases, fainter than the outline
    float cr = handCreases(hp);
    float crease = (1.0 - smoothstep(0.3 * px, 1.0 * px, cr)) * (1.0 - smoothstep(-2.0, 0.0, sd));
    ground = mix(ground, vec3(0.5, 0.48, 0.45), crease * 0.55);
    ground = mix(ground, vec3(0.72, 0.70, 0.66), line);
    col = mix(col, ground, uHandAlpha);
  }

  if (hitT > 0.0) {
    vec3 p = ro + dir * hitT;
    float px = pixLin + pixAng * hitT;
    vec3 n = calcNormal(p, max(px * 0.5, 2e-6));
    vec3 v = -dir;
    if (mat > 1.5) {
      // a freshly cut face: show the cross-section itself
      vec3 q = toTrench(p);
      float an = dot(n, uT2);
      float ax = abs(dot(n, uT1));
      float ay = abs(dot(n, uN));
      vec2 sp = vec2(q.x, q.y);
      if (ax > abs(an) && ax > ay) sp = vec2(q.z + 140.0, q.y);
      vec3 sc = sectionColor(sp, px * 1000.0, 0.0, gl_FragCoord.xy);
      // the exposed wall is clean; the floor and the other walls lie in the pit's shadow
      float isWall = smoothstep(0.85, 0.97, an);
      float depth = clamp(-q.y / PIT_D, 0.0, 1.0);
      float pit = mix(mix(0.8, 0.42, depth), 1.0, isWall);
      float facing = mix(0.82, 1.0, abs(dot(n, v)));
      col = sc * facing * pit;
    } else {
      vec3 nc = toCam(n);
      vec3 rc = toCam(reflect(dir, n));
      float NoV = clamp(dot(n, v), 0.0, 1.0);
      vec3 base;
      float rough;
      // gold TiN where the tool is coated; the shank is left as bare ground carbide
      float coat = smoothstep(COAT_END - 1.2, COAT_END + 0.6, p.z);
      if (coat < 0.999) {
        // circumferential grinding marks on the shank
        float ang = atan(p.y, p.x);
        float g = sin(p.z * 260.0 + 3.0 * vnoise(vec2(ang * 30.0, p.z * 2.0))) * lod(0.024, px);
        vec3 tz = vec3(0.0, 0.0, 1.0);
        n = normalize(n + (1.0 - coat) * 0.03 * g * normalize(tz - n * dot(tz, n)));
        rc = toCam(reflect(dir, n));
      }
      {
        base = mix(vec3(0.6, 0.61, 0.63), vec3(0.95, 0.71, 0.31), coat);
        rough = mix(0.3, 0.24, coat);
        // grinding marks on the clearance faces of the point
        float which;
        float dp = sdPoint(p, which);
        float onFacet = (1.0 - smoothstep(0.0, 0.003, abs(dp))) * smoothstep(HONE * 1.3, HONE * 3.0, -sdBody(p));
        if (onFacet > 0.0 && uGrind > 0.0) {
          vec3 gdir = normalize(vec3(0.94, 0.0, -0.34));
          float ph = dot(p, gdir) / 0.0042 + 2.0 * vnoise(vec2(dot(p, gdir) * 60.0, p.z * 30.0));
          float g = sin(ph * 6.2831) * lod(0.0042, px) * onFacet * uGrind;
          vec3 tdir = normalize(gdir - n * dot(gdir, n));
          n = normalize(n + tdir * 0.022 * g);
          rc = toCam(reflect(dir, n));
          rough += 0.08 * onFacet;
        }
      }
      vec3 F = base + (1.0 - base) * pow(1.0 - NoV, 5.0);
      vec3 spec = studio(rc, rough);
      vec3 diff = studio(nc, 1.0) * 0.1;
      float ao = calcAO(p, n, max(uFovMM * 0.015, px * 4.0));
      vec3 lin = (F * spec + base * diff) * ao;
      col = pow(aces(lin * 0.95), vec3(1.0 / 2.2));
      if (uDebug > 0.5) col = (0.5 + 0.5 * n) * (0.35 + 0.65 * max(dot(n, -dir), 0.0));
    }
  }

  // the gallium ion beam while it mills
  if (uBeam > 0.001) {
    float cov = pitCover(floor(uMill * PASSES) + 1.0);
    float floorY = -PIT_D * cov * (1.0 - PIT_RAMP * uBeamPos.y / PIT_L);
    vec3 a = uAnchor + (uT1 * uBeamPos.x + uN * floorY + uT2 * uBeamPos.y) * 0.001;
    vec3 b = a + uN * 0.4;
    vec3 ba = b - a;
    vec3 oa = ro - a;
    float dbb = dot(ba, ba);
    float dbr = dot(ba, dir);
    float dbo = dot(ba, oa);
    float drr = dot(dir, dir);
    float dro = dot(dir, oa);
    float den = dbb * drr - dbr * dbr;
    float s = clamp((dbo * drr - dbr * dro) / max(den, 1e-12), 0.0, 1.0);
    float tr = max((dbr * s - dro) / drr, 0.0);
    float dist = length(oa + dir * tr - ba * s);
    if (hitT > 0.0 && tr > hitT + 1e-6) dist = 1e9;
    float w = max(uFovMM * 0.004, (pixLin + pixAng * tr) * 1.2);
    float core = exp(-(dist * dist) / (w * w * 0.25));
    float halo = exp(-dist / (w * 5.0)) * 0.35;
    float flick = 0.85 + 0.15 * sin(uTime * 37.0);
    col += vec3(0.62, 0.70, 1.0) * (core * 0.9 + halo) * uBeam * flick;
    // impact glow
    vec3 imp = a;
    float di = length(cross(dir, imp - ro)) / length(dir);
    col += vec3(0.85, 0.88, 1.0) * exp(-di / (w * 3.0)) * 0.6 * uBeam;
    // sputtered fragments flying up and out of the pit
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float ph = uTime * 1.1 + hash11(fi * 3.7 + 0.5);
      float life = fract(ph);
      vec2 hh = hash22(vec2(fi * 1.3, floor(ph)));
      vec3 o = a + (uT1 * (hh.x - 0.5) * 6.0) * 0.001;
      vec3 sd = normalize(uN * 1.25 + uT1 * (hh.y - 0.5) * 1.6 + uT2 * (hh.x - 0.4) * 1.2);
      vec3 pp = o + sd * life * 0.06;
      vec3 rel = pp - ro;
      float tp = dot(rel, dir);
      if (tp < 0.0 || (hitT > 0.0 && tp > hitT)) continue;
      float dd = length(rel - dir * tp);
      float wp = max((pixLin + pixAng * tp) * 1.1, 0.00035);
      col += vec3(1.0, 0.86, 0.62) * exp(-dd * dd / (wp * wp)) * (1.0 - life) * 0.7 * uBeam;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
