// One WebGL context for every scene. Each scene draws into its own render target at a
// resolution it can afford; the targets are then layered on screen, outer level first,
// with the inner level fading in on top. Resolution adapts to keep the frame rate up.

import * as THREE from '../../vendor/three/three.module.min.js';

const BLIT_VS = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BLIT_FS = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform float uOpacity;
varying vec2 vUv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0; // dithering against banding in dark gradients
  gl_FragColor = vec4(c, uOpacity);
}`;

export class Compositor {
  constructor(canvas, { preserve = false } = {}) {
    THREE.ColorManagement.enabled = false;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserve,
    });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x0b0c0e, 1);
    renderer.autoClear = false;
    this.renderer = renderer;
    this.width = 1;
    this.height = 1;
    this.quality = 1;
    this.targets = new Map();
    this.frameTimes = [];
    this.lastAdjust = 0;
    this.adaptive = true;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uOpacity: { value: 1 } },
      vertexShader: BLIT_VS,
      fragmentShader: BLIT_FS,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, this.blitMat);
    mesh.frustumCulled = false;
    this.blitScene = new THREE.Scene();
    this.blitScene.add(mesh);
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(width, height) {
    this.width = Math.max(2, Math.round(width));
    this.height = Math.max(2, Math.round(height));
    this.renderer.setSize(this.width, this.height, false);
  }

  targetFor(scene) {
    const s = scene.resolutionScale ? scene.resolutionScale(this.quality, this.width, this.height) : 1;
    const w = Math.max(2, Math.round(this.width * s));
    const h = Math.max(2, Math.round(this.height * s));
    let rt = this.targets.get(scene);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(w, h, {
        depthBuffer: !!scene.needsDepth,
        stencilBuffer: false,
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      this.targets.set(scene, rt);
    } else if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h);
    }
    return rt;
  }

  /** layers: [{ scene, opacity }] from the outermost to the innermost. */
  render(layers, view) {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.clear(true, true, false);
    for (const layer of layers) {
      const rt = this.targetFor(layer.scene);
      layer.scene.update(view, { width: rt.width, height: rt.height, opacity: layer.opacity });
      r.setRenderTarget(rt);
      r.clear(true, true, false);
      layer.scene.render(r, rt, view);
      r.setRenderTarget(null);
      this.blitMat.uniforms.tSrc.value = rt.texture;
      this.blitMat.uniforms.uOpacity.value = layer.opacity;
      r.render(this.blitScene, this.blitCam);
    }
  }

  /** Feed the interval between two consecutive rendered frames (ms). */
  sample(intervalMs, nowS) {
    if (!this.adaptive) return;
    if (intervalMs <= 0 || intervalMs > 250) return;
    const f = this.frameTimes;
    f.push(intervalMs);
    if (f.length > 36) f.shift();
    if (f.length < 24 || nowS - this.lastAdjust < 0.8) return;
    const sorted = f.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    if (median > 20.5 && this.quality > 0.42) {
      this.quality = Math.max(0.42, this.quality * 0.86);
      this.lastAdjust = nowS;
      f.length = 0;
    } else if (median < 17.6 && this.quality < 1 && nowS - this.lastAdjust > 2.5) {
      this.quality = Math.min(1, this.quality * 1.07);
      this.lastAdjust = nowS;
      f.length = 0;
    }
  }
}

/** A full-screen triangle with a shader, the building block of the 2D and ray-marched scenes. */
export function fullscreenPass(material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { scene, camera, mesh };
}

export { THREE };
