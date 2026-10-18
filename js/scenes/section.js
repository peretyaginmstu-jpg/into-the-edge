// Levels 3–5: the cross-section as an electron microscope would show it.
// Scanning-electron look at first, then a Z-contrast STEM look where the nanolayers and,
// further in, the rows of atoms appear. The view zooms straight into one point in the coating.

import { fullscreenPass } from '../engine/compositor.js';
import { clamp, smoothstep } from '../engine/math.js';
import { NOISE_GLSL, SECTION_GLSL, SECTION_CENTRE } from './section-glsl.js';

const VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = /* glsl */`
precision highp float;
uniform vec2 uRes;
uniform float uFov;       // micrometres across the shorter side
uniform float uStyle;     // 0 SEM, 1 STEM
uniform float uMask;      // isolates the block that becomes the 3D lattice
uniform float uBlock;     // half size of that block, micrometres
${NOISE_GLSL}
${SECTION_GLSL}
void main() {
  float ref = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / ref;
  vec2 off = uv * uFov;
  vec2 p = uSecCentre + off;
  float px = uFov / ref;
  vec3 c = sectionColor(p, px, uStyle, gl_FragCoord.xy);
  if (uMask > 0.0) {
    vec2 d = abs(off) - vec2(uBlock);
    float outside = smoothstep(-uBlock * 0.05, uBlock * 0.2, max(d.x, d.y));
    c = mix(c, vec3(0.043, 0.046, 0.052), uMask * outside);
  }
  vec2 vv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.18 * dot(vv, vv);
  gl_FragColor = vec4(c, 1.0);
}`;

export default class SectionScene {
  constructor({ THREE, app, params }) {
    this.THREE = THREE;
    this.app = app;
    this.params = params;
  }

  init() {
    const THREE = this.THREE;
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uFov: { value: 15 },
      uStyle: { value: 0 },
      uMask: { value: 0 },
      uBlock: { value: 0.00112 },
      uSeed: { value: (this.app.journey.seed % 997) * 0.173 },
      uSecCentre: { value: new THREE.Vector2(SECTION_CENTRE[0], SECTION_CENTRE[1]) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false });
    this.pass = fullscreenPass(this.material);
  }

  warmup(renderer) { renderer.compile(this.pass.scene, this.pass.camera); }

  resolutionScale(quality, w, h) {
    return clamp(Math.sqrt(2.2e6 / (w * h)), 0.3, 1) * quality;
  }

  update(view, layer) {
    const u = this.uniforms;
    const z = view.z;
    u.uRes.value.set(layer.width, layer.height);
    u.uFov.value = view.fov * 1e6;
    const st = this.params.style || [-5.85, -6.55];
    u.uStyle.value = smoothstep(st[0], st[1], z);
    const mk = this.params.mask || [-7.85, -8.12];
    u.uMask.value = smoothstep(mk[0], mk[1], z);
  }

  render(renderer) {
    renderer.render(this.pass.scene, this.pass.camera);
  }

  /** Names the layers of the coating while the whole section is in view. */
  overlay(ctx, view, opacity, { label, t }) {
    const a = smoothstep(-4.6, -4.72, view.z) * (1 - smoothstep(-5.02, -5.26, view.z)) * opacity;
    if (a < 0.01) return;
    const jid = this.app.journey.id;
    const s = view.pxPerM * 1e-6; // px per µm
    const yOf = (um) => view.h / 2 - (um - SECTION_CENTRE[1]) * s;
    const landscape = view.w > view.h;
    const x0 = landscape ? Math.max(24, (view.w - view.ref) / 2 - 220) : 14;
    const rows = [
      { at: -1.35, key: 'layerMain' },
      { at: -2.8, key: 'layerTransition' },
      { at: -3.4, key: 'layerGraded' },
      { at: -3.95, key: 'layerAdhesion' },
      { at: -6.2, key: 'layerCarbide' },
    ].map((r) => ({ ...r, y: yOf(r.at), ly: yOf(r.at) }));
    // keep the labels apart; thin layers get a short leader line
    const gap = 17;
    for (let i = 1; i < rows.length; i++) rows[i].ly = Math.max(rows[i].ly, rows[i - 1].ly + gap);
    const lastOver = rows[rows.length - 1].ly - (view.h - 30);
    if (lastOver > 0) for (const r of rows) r.ly -= lastOver;
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = 'rgba(236,232,224,0.85)';
    ctx.lineWidth = 1;
    for (const r of rows) {
      if (r.y < 30 || r.y > view.h - 20) continue;
      ctx.beginPath();
      ctx.moveTo(x0, r.y);
      ctx.lineTo(x0 + 10, r.y);
      ctx.lineTo(x0 + 18, r.ly);
      ctx.stroke();
    }
    // the whole coating, bracketed on the right
    const bx = landscape ? view.w / 2 + view.ref * 0.36 : view.w - 62;
    const y0 = yOf(0);
    const y1 = yOf(-4.0);
    ctx.beginPath();
    const tick = landscape ? -6 : 6;
    ctx.moveTo(bx + tick, y0); ctx.lineTo(bx, y0); ctx.lineTo(bx, y1); ctx.lineTo(bx + tick, y1);
    ctx.stroke();
    ctx.restore();
    for (const r of rows) {
      if (r.y < 30 || r.y > view.h - 20) continue;
      label(t(`${jid}.section.${r.key}`), x0 + 22, r.ly, { align: 'left', alpha: a });
    }
    if (landscape) label(t(`${jid}.section.coating`), bx + 10, (y0 + y1) / 2, { align: 'left', alpha: a });
    else label(t(`${jid}.section.coating`), bx - 10, (y0 + y1) / 2, { align: 'right', alpha: a });
  }
}
