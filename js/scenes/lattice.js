// Levels 6–7: the rock-salt (NaCl-type) lattice of cubic TiAlN. A block of cells that can be
// turned with the mouse or a finger, then a single cell with softly glowing, gently vibrating
// atoms. Units are nanometres; the block arrives aligned with the electron-microscope picture.

import { createRng, subSeed } from '../engine/rng.js';
import { clamp, smoothstep } from '../engine/math.js';

const SPHERE_VS = /* glsl */`
attribute vec3 offset;
attribute vec4 info;   // radius, species, distance from the centre (Chebyshev), phase
attribute vec3 tint;
uniform float uKeep;
uniform float uTime;
uniform float uVib;
uniform float uScale;
varying vec2 vUv;
varying vec3 vCentre;
varying float vRadius;
varying vec3 vColor;
varying float vDepth;
void main() {
  float keep = smoothstep(uKeep + 0.07, uKeep - 0.005, info.z);
  float r = info.x * keep * uScale;
  vec3 wob = uVib * vec3(sin(uTime * 7.3 + info.w * 6.28), sin(uTime * 8.7 + info.w * 12.1), sin(uTime * 6.1 + info.w * 19.7));
  vec4 mv = modelViewMatrix * vec4(offset + wob, 1.0);
  vCentre = mv.xyz;
  vRadius = r;
  vUv = position.xy;
  vColor = tint;
  vDepth = mv.z;
  mv.xy += position.xy * r;
  gl_Position = projectionMatrix * mv;
  if (r <= 1e-5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const SPHERE_FS = /* glsl */`
precision highp float;
uniform mat4 projectionMatrix;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uBg;
uniform float uRim;
varying vec2 vUv;
varying vec3 vCentre;
varying float vRadius;
varying vec3 vColor;
varying float vDepth;
void main() {
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float h = sqrt(1.0 - d2);
  vec3 n = vec3(vUv, h);
  vec3 L = normalize(vec3(-0.45, 0.62, 0.65));
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  float rim = pow(1.0 - h, 2.2);
  vec3 col = vColor * (0.16 + 0.84 * diff) + vec3(spec * 0.55) + vec3(0.84, 0.66, 0.34) * rim * uRim;
  vec3 pv = vCentre + n * vRadius;
  vec4 clip = projectionMatrix * vec4(pv, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  float fog = smoothstep(uFogNear, uFogFar, -pv.z);
  col = mix(col, uBg, fog * 0.72);
  // smooth silhouette
  float aa = fwidth(d2);
  float alpha = 1.0 - smoothstep(1.0 - aa * 1.5, 1.0, d2);
  gl_FragColor = vec4(mix(uBg, col, alpha), 1.0);
}`;

const GLOW_FS = /* glsl */`
precision highp float;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vColor;
varying float vRadius;
void main() {
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float g = exp(-d2 * 5.5) - exp(-5.5);
  vec3 c = mix(vColor, vec3(1.0, 0.86, 0.6), 0.35);
  gl_FragColor = vec4(c * g * uGlow, 1.0);
}`;

const LINE_VS = /* glsl */`
uniform float uTime;
uniform float uVib;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LINE_FS = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
void main() { gl_FragColor = vec4(uColor, uAlpha); }`;

const SPECIES = [
  { name: 'Ti', color: [0.45, 0.58, 0.74], radius: 0.07 },
  { name: 'Al', color: [0.80, 0.81, 0.84], radius: 0.064 },
  { name: 'N', color: [0.26, 0.44, 0.92], radius: 0.052 },
];

export default class LatticeScene {
  constructor({ THREE, app, params, seed }) {
    this.THREE = THREE;
    this.app = app;
    this.params = params;
    this.seed = seed;
    this.needsDepth = true;
    this.a = params.cell ?? 0.42;    // nm, lattice period
    this.cells = params.cells ?? 5;
    this.alFraction = params.alFraction ?? 0.5;
    this.userQ = new THREE.Quaternion();
    this.tmpQ = new THREE.Quaternion();
  }

  init() {
    const THREE = this.THREE;
    const rng = createRng(subSeed(this.seed, 'lattice'));
    const n = this.cells * 2 + 1;
    const h = this.a / 2;
    const c = this.cells;
    const offsets = [];
    const infos = [];
    const tints = [];
    this.atoms = [];
    for (let i = 0; i <= 2 * c; i++) {
      for (let j = 0; j <= 2 * c; j++) {
        for (let k = 0; k <= 2 * c; k++) {
          const metal = (i + j + k) % 2 === 0;
          const sp = metal ? (rng.next() < this.alFraction ? 1 : 0) : 2;
          const x = (i - c) * h;
          const y = (j - c) * h;
          const z = (k - c) * h;
          const cheb = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
          offsets.push(x, y, z);
          infos.push(SPECIES[sp].radius, sp, cheb, rng.next());
          tints.push(...SPECIES[sp].color);
          this.atoms.push({ x, y, z, sp, cheb });
        }
      }
    }
    void n;
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geo.setAttribute('info', new THREE.InstancedBufferAttribute(new Float32Array(infos), 4));
    geo.setAttribute('tint', new THREE.InstancedBufferAttribute(new Float32Array(tints), 3));
    geo.instanceCount = this.atoms.length;
    this.common = {
      uKeep: { value: 10 },
      uTime: { value: 0 },
      uVib: { value: 0 },
      uScale: { value: 1 },
    };
    this.sphereMat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.common,
        uFogNear: { value: 0 }, uFogFar: { value: 3 },
        uBg: { value: new THREE.Color(0.043, 0.046, 0.052) },
        uRim: { value: 0.0 },
      },
      vertexShader: SPHERE_VS,
      fragmentShader: SPHERE_FS,
    });
    this.spheres = new THREE.Mesh(geo, this.sphereMat);
    this.spheres.frustumCulled = false;

    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { ...this.common, uScale: { value: 2.1 }, uGlow: { value: 0.05 } },
      vertexShader: SPHERE_VS,
      fragmentShader: GLOW_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(geo, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2;

    // the single unit cell, outlined in gold, and the nearest-neighbour bonds inside it
    const e = h;
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * e, sy * e, sz * e]);
    const edges = [];
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        const d = corners[i].reduce((s, v, k) => s + (v !== corners[j][k] ? 1 : 0), 0);
        if (d === 1) edges.push(...corners[i], ...corners[j]);
      }
    }
    const cellGeo = new THREE.BufferGeometry();
    cellGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    this.cellMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.84, 0.66, 0.32) }, uAlpha: { value: 0 }, uTime: this.common.uTime, uVib: this.common.uVib },
      vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
    });
    this.cellLines = new THREE.LineSegments(cellGeo, this.cellMat);
    this.cellLines.renderOrder = 3;

    const inner = this.atoms.filter((a) => a.cheb <= h + 1e-6);
    const bonds = [];
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        const A = inner[i];
        const B = inner[j];
        const d = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
        if (Math.abs(d - h) < 1e-6 && (A.sp === 2) !== (B.sp === 2)) bonds.push(A.x, A.y, A.z, B.x, B.y, B.z);
      }
    }
    const bondGeo = new THREE.BufferGeometry();
    bondGeo.setAttribute('position', new THREE.Float32BufferAttribute(bonds, 3));
    this.bondMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.62, 0.66, 0.74) }, uAlpha: { value: 0 }, uTime: this.common.uTime, uVib: this.common.uVib },
      vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
    });
    this.bondLines = new THREE.LineSegments(bondGeo, this.bondMat);
    this.bondLines.renderOrder = 1;

    this.group = new THREE.Group();
    this.group.add(this.spheres, this.bondLines, this.glow, this.cellLines);
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.add(this.group);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    const E = (x, y, zz) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, zz, 'XYZ'));
    const d2r = Math.PI / 180;
    this.q6 = E(15 * d2r, -24 * d2r, 0);
    this.q7 = E(11 * d2r, -30 * d2r, 0);
    this.qId = new THREE.Quaternion();
  }

  warmup(renderer) { renderer.compile(this.scene, this.camera); }

  resolutionScale(quality, w, h) {
    return clamp(Math.sqrt(3.2e6 / (w * h)), 0.5, 1) * Math.max(0.7, quality);
  }

  pathQuaternion(z) {
    const q = new this.THREE.Quaternion();
    const t1 = smoothstep(-8.2, -8.52, z);
    const t2 = smoothstep(-8.6, -9.25, z);
    q.slerpQuaternions(this.qId, this.q6, t1);
    if (t2 > 0) q.slerp(this.q7, t2);
    return q;
  }

  userWeight(z) { return smoothstep(-8.24, -8.4, z); }

  update(view, layer) {
    const z = view.z;
    const fovNm = view.fov * 1e9;
    const aspect = layer.width / layer.height;
    const halfS = fovNm / 2;
    const cam = this.camera;
    if (aspect >= 1) { cam.left = -halfS * aspect; cam.right = halfS * aspect; cam.top = halfS; cam.bottom = -halfS; }
    else { cam.left = -halfS; cam.right = halfS; cam.top = halfS / aspect; cam.bottom = -halfS / aspect; }
    cam.updateProjectionMatrix();

    const qPath = this.pathQuaternion(z);
    this.tmpQ.copy(this.qId).slerp(this.userQ, this.userWeight(z));
    this.group.quaternion.copy(this.tmpQ).multiply(qPath);

    const u = this.common;
    u.uTime.value = view.t;
    const atomLevel = smoothstep(-8.75, -9.2, z);
    u.uVib.value = view.reduced ? 0 : 0.0065 * atomLevel;
    u.uKeep.value = 0.215 + (1.4 - 0.215) * (1 - smoothstep(-8.62, -9.12, z));
    u.uScale.value = 1 - 0.34 * smoothstep(-8.7, -9.2, z);
    this.glowMat.uniforms.uGlow.value = 0.025 + 0.16 * atomLevel;
    this.sphereMat.uniforms.uRim.value = 0.12 + 0.35 * atomLevel;
    const span = this.cells * this.a * 0.9;
    this.sphereMat.uniforms.uFogNear.value = 10 - span * 0.2;
    this.sphereMat.uniforms.uFogFar.value = 10 + span * 1.1;
    this.cellMat.uniforms.uAlpha.value = 0.85 * smoothstep(-8.9, -9.2, z);
    this.bondMat.uniforms.uAlpha.value = 0.35 * smoothstep(-8.95, -9.25, z);
  }

  isAnimating(view) {
    return !view.reduced && view.z < -8.75;
  }

  render(renderer) {
    renderer.setClearColor(0x0b0c0e, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
  }

  rotatable(view) { return view ? this.userWeight(view.z) : 0; }

  rotate(dx, dy) {
    const THREE = this.THREE;
    const k = 0.007;
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k);
    this.userQ.premultiply(qy).premultiply(qx).normalize();
  }

  overlay(ctx, view, opacity, { label, t }) {
    const a = smoothstep(-8.3, -8.45, view.z) * opacity * (1 - smoothstep(0.05, 0.4, view.final));
    if (a < 0.01) return;
    const jid = this.app.journey.id;
    const oy = (view.h - view.ref) / 2;
    const landscape = view.w > view.h;
    const x0 = landscape ? 26 : 16;
    let y = landscape ? view.h - 205 : Math.max(96, oy - 70);
    for (let s = 0; s < 3; s++) {
      const c = SPECIES[s].color.map((v) => Math.round(v * 255));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.beginPath();
      ctx.arc(x0 + 6, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(t(`${jid}.lattice.${SPECIES[s].name}`), x0 + 18, y, { align: 'left', alpha: a });
      y += 22;
    }
  }
}
