// Placeholder levels for building a new journey: each level is a framed square with a grid,
// and the next level is born at an anchor inside it. Useful to test a journey config before
// any real picture exists (add it to "scenes" in the journey file).

import { fullscreenPass } from '../engine/compositor.js';
import { driftCentre, span } from '../engine/math.js';

const FS = /* glsl */`
precision highp float;
uniform vec2 uRes;
uniform vec2 uCentre;
uniform float uScale;
uniform vec2 uAnchorA;
uniform vec2 uAnchorB;
uniform float uChild;
uniform float uGrandChild;
uniform float uLevel;

float gridLine(vec2 q, float stepSize, float px) {
  vec2 g = abs(fract(q / stepSize - 0.5) - 0.5) * stepSize;
  return 1.0 - smoothstep(0.5 * px, 1.5 * px, min(g.x, g.y));
}
float boxLine(vec2 q, vec2 c, float h, float px) {
  vec2 d = abs(q - c) - vec2(h);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(0.6 * px, 1.6 * px, abs(sd));
}
float ringLine(vec2 q, float r, float px) {
  return 1.0 - smoothstep(0.6 * px, 1.6 * px, abs(length(q) - r));
}
vec3 levelPattern(vec2 q, float px, float level, vec2 anchor, float child) {
  vec3 col = vec3(0.043, 0.047, 0.055);
  float inside = step(max(abs(q.x), abs(q.y)), 0.5);
  col += inside * vec3(0.018, 0.019, 0.021);
  col = mix(col, vec3(0.15), gridLine(q, 0.1, px) * inside * 0.55);
  col = mix(col, vec3(0.34), boxLine(q, vec2(0.0), 0.5, px));
  col = mix(col, vec3(0.28), ringLine(q, 0.22 + 0.025 * mod(level, 4.0), px));
  col = mix(col, vec3(0.84, 0.66, 0.32), boxLine(q, anchor, child * 0.5, px));
  return col;
}
void main() {
  float ref = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / ref;
  vec2 q = uCentre + uv * uScale;
  float px = uScale / ref;
  vec3 col = levelPattern(q, px, uLevel, uAnchorA, uChild);
  vec2 qc = (q - uAnchorA) / uChild;
  float a = smoothstep(0.05, 0.3, uChild / uScale) * step(max(abs(qc.x), abs(qc.y)), 0.5);
  col = mix(col, levelPattern(qc, px / uChild, uLevel + 1.0, uAnchorB, uGrandChild), a);
  gl_FragColor = vec4(col, 1.0);
}`;

const VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export default class PlaceholderScene {
  constructor({ THREE, app, params }) {
    this.THREE = THREE;
    this.app = app;
    this.anchors = params.anchors || [[0.21, -0.13], [-0.18, 0.16], [0.15, 0.2], [-0.22, -0.1]];
  }

  init() {
    const THREE = this.THREE;
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uCentre: { value: new THREE.Vector2() },
      uScale: { value: 1 },
      uAnchorA: { value: new THREE.Vector2() },
      uAnchorB: { value: new THREE.Vector2() },
      uChild: { value: 0.1 },
      uGrandChild: { value: 0.1 },
      uLevel: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false });
    this.pass = fullscreenPass(this.material);
  }

  update(view, layer) {
    const stops = this.app.stops;
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1].z >= view.z) i++;
    const parent = stops[i];
    const child = stops[i + 1];
    const t = span(parent.z, child.z, view.z);
    const k = view.fov / parent.fovM;
    const a = this.anchors[i % this.anchors.length];
    const b = this.anchors[(i + 1) % this.anchors.length];
    const c = driftCentre([0, 0], a, t, k);
    const u = this.uniforms;
    u.uRes.value.set(layer.width, layer.height);
    u.uCentre.value.set(c[0], c[1]);
    u.uScale.value = k;
    u.uAnchorA.value.set(a[0], a[1]);
    u.uAnchorB.value.set(b[0], b[1]);
    u.uChild.value = child.fovM / parent.fovM;
    const grand = stops[i + 2] || child;
    u.uGrandChild.value = grand.fovM / child.fovM;
    u.uLevel.value = i;
  }

  render(renderer) {
    renderer.render(this.pass.scene, this.pass.camera);
  }
}
