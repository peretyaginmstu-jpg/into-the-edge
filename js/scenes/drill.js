// Levels 0–2 and the ion-beam transition: a ray-marched, gold-coated drill bit.
// The camera path is a pure function of z, so scrolling back plays everything in reverse.

import { fullscreenPass } from '../engine/compositor.js';
import { clamp, smoothstep, span } from '../engine/math.js';
import { DRILL_VS, DRILL_FS } from './drill-glsl.js';
import { SECTION_CENTRE } from './section-glsl.js';

// --- tiny vector helpers (doubles; the GPU only sees the final numbers) ---
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / len(a));

// Drill constants shared with the shader.
const K = 0.36397; // cot 70°
const B1 = 0.1763;
const WEB = 0.6;
const ZC = -1.44;
const TWIST = 0.1443;
const R = 4.0;

/** Point on the cutting lip of land 1 at a given x (twisted rake face ∩ primary facet). */
function lipPoint(x) {
  let y = -WEB;
  let z = 0;
  for (let i = 0; i < 8; i++) {
    z = -K * x + B1 * (y + WEB);
    const th = (z - ZC) * TWIST;
    y = (-WEB + x * Math.sin(th)) / Math.cos(th);
  }
  z = -K * x + B1 * (y + WEB);
  return [x, y, z];
}

/** Frame of the ion-beam pit: its exposed wall lies 70 µm behind the lip, near the outer corner. */
function trenchFrame() {
  const xc = 3.8;
  const L = lipPoint(xc);
  const t1raw = norm(sub(lipPoint(xc + 0.01), lipPoint(xc - 0.01)));
  const n = norm([K, -B1, 1]);
  let t1 = norm(sub(t1raw, mul(n, dot(t1raw, n))));
  let behind = norm(cross(n, t1));
  if (behind[1] > 0) behind = mul(behind, -1);
  const anchor = add(L, mul(behind, 0.07));
  const t2 = mul(behind, -1); // from the wall towards the lip
  t1 = norm(cross(mul(t2, -1), n)); // so the camera facing the wall sees +t1 to its right
  return { anchor, t1, n, t2, lip: L };
}

// quaternion helpers for smooth camera turns
function quatFromBasis(r, u, f) {
  // columns: right, up, back (= -forward)
  const b = mul(f, -1);
  const m00 = r[0], m01 = u[0], m02 = b[0];
  const m10 = r[1], m11 = u[1], m12 = b[1];
  const m20 = r[2], m21 = u[2], m22 = b[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return q;
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((v) => -v); }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (bb[i] - v) * t);
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
function basisFromQuat(q) {
  const [x, y, z, w] = q;
  const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  const u = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  const b = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return { r, u, f: mul(b, -1) };
}
/** Camera basis looking along dir with a preferred up vector. */
function lookBasis(dir, upHint) {
  const f = norm(dir);
  let r = cross(f, upHint);
  if (len(r) < 1e-6) r = cross(f, [0, 0, 1]);
  r = norm(r);
  const u = cross(r, f);
  return { r, u, f };
}
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export default class DrillScene {
  constructor({ THREE, app, params }) {
    this.THREE = THREE;
    this.app = app;
    this.params = params;
    this.tanHalf = Math.tan((14 * Math.PI) / 360); // a long lens: 14° across the shorter side
    this.frame = trenchFrame();
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  init() {
    const THREE = this.THREE;
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const fr = this.frame;
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uCamPos: { value: new THREE.Vector3() },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
      uTanHalf: { value: this.tanHalf },
      uOrtho: { value: 0 },
      uFovMM: { value: 200 },
      uTime: { value: 0 },
      uHandC: { value: new THREE.Vector2() },
      uHandR: { value: new THREE.Vector2(1, 0) },
      uHandU: { value: new THREE.Vector2(0, 1) },
      uHandAlpha: { value: 1 },
      uAnchor: { value: V3(fr.anchor) },
      uT1: { value: V3(fr.t1) },
      uN: { value: V3(fr.n) },
      uT2: { value: V3(fr.t2) },
      uMill: { value: 0 },
      uBeam: { value: 0 },
      uBeamPos: { value: new THREE.Vector2() },
      uWallView: { value: 0 },
      uMaxDist: { value: 1e5 },
      uSteps: { value: 150 },
      uGrind: { value: 1 },
      uDebug: { value: 0 },
      uSeed: { value: (this.app.journey.seed % 997) * 0.173 },
      uSecCentre: { value: new THREE.Vector2(SECTION_CENTRE[0], SECTION_CENTRE[1]) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: DRILL_VS,
      fragmentShader: DRILL_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.pass = fullscreenPass(this.material);
    this.buildPath();
  }

  warmup(renderer) { renderer.compile(this.pass.scene, this.pass.camera); }

  /** Keyframes of the camera, indexed by z = log10(field of view in metres). */
  buildPath() {
    const fr = this.frame;
    const app = this.app;
    const z = (id) => app.stopById(id).z;
    // Level 0: straight down on the palm, the drill pointing to the upper right.
    const up0 = [0.866, 0, 0.5];
    this.handUp = [up0[0], up0[2]];
    this.handRight = [-0.5, 0.866];
    const radial = norm([fr.lip[0], fr.lip[1], 0]);
    const LONG = Math.tan((14 * Math.PI) / 360); // a long lens for the whole tool
    const WIDE = 0.42;                           // a wider one once we go down into the pit
    const pit = add(fr.anchor, mul(fr.t2, 0.0225)); // middle of the pit, at the surface
    const wall = (yUm) => add(fr.anchor, mul(fr.n, yUm * 0.001));
    const k0 = { z: z('0'), target: [0, -2, -2], basis: lookBasis([0, -1, 0], up0), ortho: 0, lens: LONG };
    // Level 1: the point face at three quarters, the body running off to the lower left.
    const k1 = { z: z('1'), target: [0, 0, -2.2], basis: lookBasis([-0.15, -0.55, -0.82], [0.3, -0.85, 0.4]), ortho: 0, lens: LONG };
    // Level 2: the outer corner of the cutting edge; the frame is centred where the beam will cut.
    const v2 = norm(add(add(mul(fr.n, -0.6), mul(fr.t2, -0.6)), mul(radial, -0.5)));
    const k2 = { z: z('2'), target: pit, basis: lookBasis(v2, fr.n), ortho: 0, lens: LONG };
    // Transition: from above, the beam coming down into the pit it is milling.
    const v2b = norm(add(add(mul(fr.n, -0.82), mul(fr.t2, -0.48)), mul(fr.t1, -0.32)));
    const k2b = { z: z('2b'), target: pit, basis: lookBasis(v2b, fr.n), ortho: 0, lens: 0.32 };
    // Then the camera slowly goes down into the pit and turns to face the cut wall.
    const kc = { z: -4.22, target: wall(-5), basis: lookBasis(add(mul(fr.t2, -0.82), mul(fr.n, -0.57)), fr.n), ortho: 0, lens: WIDE };
    const kd = { z: -4.42, target: wall(-2.5), basis: lookBasis(add(mul(fr.t2, -0.985), mul(fr.n, -0.17)), fr.n), ortho: 0, lens: WIDE };
    const kw = { z: -4.56, target: wall(SECTION_CENTRE[1]), basis: lookBasis(mul(fr.t2, -1), fr.n), ortho: 0, lens: WIDE };
    const keys = [k0, k1, k2, k2b, kc, kd, kw];
    for (const k of keys) k.q = quatFromBasis(k.basis.r, k.basis.u, k.basis.f);
    this.keys = keys;
  }

  cameraAt(zv) {
    const keys = this.keys;
    if (zv >= keys[0].z) return { ...keys[0], fov: Math.pow(10, zv) * 1000 };
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].z > zv) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const t = span(a.z, b.z, zv);
    const e = smoother(t);
    const fov = Math.pow(10, zv) * 1000; // mm
    const fovA = Math.pow(10, a.z) * 1000;
    const k = (1 - e) * Math.min(1, fov / fovA);
    const target = add(b.target, mul(sub(a.target, b.target), k));
    const basis = basisFromQuat(slerp(a.q, b.q, e));
    const ortho = a.ortho + (b.ortho - a.ortho) * smoothstep(0.2, 1.0, t);
    const lens = a.lens + (b.lens - a.lens) * e;
    return { target, basis, ortho, fov, lens };
  }

  resolutionScale(quality, w, h) {
    // phones get fewer ray-marched pixels; their screens are small and their GPUs slower
    const budget = this.coarse ? 0.85e6 : 1.5e6;
    return clamp(Math.sqrt(budget / (w * h)), 0.25, 1) * quality;
  }

  update(view, layer) {
    const u = this.uniforms;
    const zv = view.z;
    let cam = this.cameraAt(zv);
    if (this.debugCam) {
      // { target: [x,y,z] mm, dir: [x,y,z], up: [x,y,z], fov: mm, ortho: 0..1 }
      const d = this.debugCam;
      cam = { target: d.target, basis: lookBasis(d.dir, d.up || [0, 1, 0]), ortho: d.ortho || 0, fov: d.fov || cam.fov, lens: d.lens || cam.lens };
    }
    const dist = cam.fov / (2 * cam.lens);
    const pos = sub(cam.target, mul(cam.basis.f, dist));
    this.cam = { ...cam, pos, dist };
    u.uRes.value.set(layer.width, layer.height);
    u.uCamPos.value.set(...pos);
    u.uCamRight.value.set(...cam.basis.r);
    u.uCamUp.value.set(...cam.basis.u);
    u.uCamFwd.value.set(...cam.basis.f);
    u.uOrtho.value = cam.ortho;
    u.uTanHalf.value = cam.lens;
    u.uFovMM.value = cam.fov;
    u.uTime.value = view.t;
    // the palm
    u.uHandAlpha.value = 1 - smoothstep(-0.95, -1.45, zv);
    const hc = this.params.handCentre || [-14, -56];
    u.uHandC.value.set(hc[0], hc[1]);
    u.uHandR.value.set(this.handRight[0], this.handRight[1]);
    u.uHandU.value.set(this.handUp[0], this.handUp[1]);
    // the beam mills a pit into the clearance face, pass by pass, deeper as we scroll
    const PASSES = 9;
    const mill = smoothstep(-3.6, -4.12, zv);
    u.uMill.value = mill;
    const beam = smoothstep(-3.58, -3.66, zv) * (1 - smoothstep(-4.1, -4.16, zv));
    u.uBeam.value = view.reduced ? beam * 0.8 : beam;
    if (beam > 0) {
      // fast sweeps along the edge, at the front of the pass in progress
      const tt = view.reduced ? 0.25 : view.t * 1.6;
      const tri = 1 - Math.abs(((tt % 2) + 2) % 2 - 1);
      const front = 45 * (1 - ((mill * PASSES) % 1));
      u.uBeamPos.value.set(-28 + 56 * tri, Math.max(0.5, front));
    }
    u.uWallView.value = smoothstep(-4.45, -4.58, zv);
    u.uMaxDist.value = dist + Math.max(cam.fov * 14, 1.5);
    u.uSteps.value = Math.round(64 + 80 * view.quality);
    u.uGrind.value = 1;
  }

  isAnimating(view) {
    return this.uniforms.uBeam.value > 0.001 && !view.reduced;
  }

  render(renderer) {
    renderer.render(this.pass.scene, this.pass.camera);
  }

  /** Projects a drill-space point (mm) to CSS pixels. */
  project(p, view) {
    const c = this.cam;
    if (!c) return null;
    const rel = sub(p, c.pos);
    const x = dot(rel, c.basis.r);
    const y = dot(rel, c.basis.u);
    const zf = dot(rel, c.basis.f);
    if (zf <= 0) return null;
    const persp = 1 / (zf * 2 * (c.lens || this.tanHalf));
    const ortho = 1 / c.fov;
    const s = persp + (ortho - persp) * c.ortho;
    return { x: view.w / 2 + x * s * view.ref, y: view.h / 2 - y * s * view.ref };
  }

  /** Level 1: leader lines to the two cutting edges. */
  annotateEdges(ctx, view, opacity, { label, t }) {
    const a = smoothstep(-1.3, -1.58, view.z) * (1 - smoothstep(-1.85, -2.15, view.z)) * opacity;
    if (a < 0.01) return;
    const text = t(`${this.app.journey.id}.annot.edge`);
    const centre = this.project([0, 0, 0.05], view);
    for (const sgn of [1, -1]) {
      const l = lipPoint(2.7);
      const p = this.project([l[0] * sgn, l[1] * sgn, l[2]], view);
      if (!p || !centre) continue;
      let dx = p.x - centre.x;
      let dy = p.y - centre.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const len = Math.min(110, view.ref * 0.16);
      const q = { x: p.x + dx * len, y: p.y + dy * len };
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(236,232,224,0.85)';
      ctx.fillStyle = 'rgba(236,232,224,0.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(text, q.x + dx * 8, q.y + dy * 8 + (dy > 0 ? 6 : -6), { align: dx > 0.3 ? 'left' : dx < -0.3 ? 'right' : 'center', alpha: a });
    }
  }

  overlay(ctx, view, opacity, helpers) {
    this.annotateEdges(ctx, view, opacity, helpers);
    const { label, t } = helpers;
    const a = (1 - smoothstep(-0.95, -1.4, view.z)) * opacity;
    if (a < 0.01) return;
    const jid = this.app.journey.id;
    // the hand
    const hc = this.params.handCentre || [-14, -56];
    const hr = this.handRight;
    const hu = this.handUp;
    const handAt = (x, y) => [hc[0] + hr[0] * x + hu[0] * y, -4, hc[1] + hr[1] * x + hu[1] * y];
    const ph = this.project(handAt(52, -40), view);
    if (ph) label(t(`${jid}.compare.hand`), ph.x, ph.y, { align: 'left', alpha: a * 0.95 });
    // diameter callout beyond the end of the shank, engineering-drawing style
    const zc = -100;
    const p1 = this.project([-4, 0, zc], view);
    const p2 = this.project([4, 0, zc], view);
    const pe = this.project([0, 0, zc], view);
    const pf = this.project([0, 0, zc - 10], view);
    if (p1 && p2 && pe && pf) {
      let ax = pf.x - pe.x;
      let ay = pf.y - pe.y;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al; ay /= al;
      const ext = 30;
      const q1 = [p1.x + ax * (ext - 7), p1.y + ay * (ext - 7)];
      const q2 = [p2.x + ax * (ext - 7), p2.y + ay * (ext - 7)];
      ctx.save();
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = 'rgba(236,232,224,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x + ax * 4, p1.y + ay * 4); ctx.lineTo(p1.x + ax * ext, p1.y + ay * ext);
      ctx.moveTo(p2.x + ax * 4, p2.y + ay * 4); ctx.lineTo(p2.x + ax * ext, p2.y + ay * ext);
      ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]);
      ctx.stroke();
      // small arrow ticks
      const dx = q2[0] - q1[0];
      const dy = q2[1] - q1[1];
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl;
      const uy = dy / dl;
      ctx.beginPath();
      for (const [px, py, sg] of [[q1[0], q1[1], 1], [q2[0], q2[1], -1]]) {
        ctx.moveTo(px, py); ctx.lineTo(px + sg * (ux * 5 + ax * 2.5), py + sg * (uy * 5 + ay * 2.5));
        ctx.moveTo(px, py); ctx.lineTo(px + sg * (ux * 5 - ax * 2.5), py + sg * (uy * 5 - ay * 2.5));
      }
      ctx.stroke();
      ctx.restore();
      const mid = [(q1[0] + q2[0]) / 2 + ax * 18, (q1[1] + q2[1]) / 2 + ay * 18];
      label(t(`${jid}.compare.drill`), mid[0], mid[1], { align: ax > 0.25 ? 'left' : ax < -0.25 ? 'right' : 'center', alpha: a * 0.95 });
    }
  }
}
