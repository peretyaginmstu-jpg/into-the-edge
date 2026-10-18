// The engine. It knows nothing about drills: a journey config lists the levels,
// the comparison objects, the scenes and the sources, and this class runs them.

import * as THREE from '../../vendor/three/three.module.min.js';
import { ZoomController } from './zoom.js';
import { Input } from './input.js';
import { Compositor } from './compositor.js';
import { Overlay } from './overlay.js';
import { UI } from './ui.js';
import { I18n, detectLanguage, rememberLanguage } from './i18n.js';
import { toMetres } from './units.js';
import { clamp, smoothstep } from './math.js';

export class App {
  constructor({ journey, journeyUrl, params, root }) {
    this.journey = journey;
    this.journeyUrl = journeyUrl;
    this.params = params;
    this.root = root;
    this.debug = params.has('debug');
    this.record = params.get('record') === '1';
    this.playing = false;
    this.autopilot = null;
    this.dirty = true;
    this.lastT = 0;
    this.lastRenderT = 0;
    this.fpsFrames = 0;
    this.fpsT = 0;
    this.debugInfo = { fps: 0 };
    this.frame = this.frame.bind(this);

    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = mq.matches || params.get('motion') === 'reduce';
    const onMotion = () => {
      this.reduced = mq.matches;
      this.zoom.reduced = this.reduced;
      this.dirty = true;
    };
    if (mq.addEventListener) mq.addEventListener('change', onMotion);

    this.stops = journey.stops.map((s, index) => {
      const fovM = toMetres(s.fov[0], s.fov[1]);
      return { ...s, index, fovM, z: Math.log10(fovM) };
    });
    this.zInner = this.stops[this.stops.length - 1].z;
    this.pStart = this.stops[0].z;
    this.pEnd = this.zInner - (journey.finalStretch || 0.35);
  }

  stopById(id) { return this.stops.find((s) => s.id === String(id)); }
  source(id) {
    const s = this.journey.sources[id];
    if (!s) return null;
    const key = `${this.journey.id}.sources.${id}`;
    return { ...s, text: this.i18n.has(key) ? this.i18n.t(key) : s.text };
  }

  async start() {
    this.i18n = new I18n(new URL('../../i18n/', import.meta.url).href);
    const lang = detectLanguage(this.params);
    await this.i18n.load(lang);
    document.documentElement.lang = lang;
    document.title = this.i18n.t('ui.title');

    this.zoom = new ZoomController({
      start: this.pStart,
      end: this.pEnd,
      stops: [...this.stops.map((s) => s.z), this.pEnd],
      reducedMotion: this.reduced,
    });

    const glCanvas = this.root.querySelector('#gl');
    try {
      this.compositor = new Compositor(glCanvas, { preserve: this.record });
    } catch (err) {
      this.fail(this.i18n.t('ui.noWebgl'));
      throw err;
    }
    if (!this.compositor.renderer.capabilities.isWebGL2) {
      this.fail(this.i18n.t('ui.noWebgl'));
      return;
    }

    const seed = this.journey.seed >>> 0;
    this.layers = [];
    this.scenes = [];
    for (const spec of this.journey.scenes) {
      const mod = await import(new URL(spec.module, this.journeyUrl).href);
      const SceneClass = mod.default;
      const scene = new SceneClass({ THREE, renderer: this.compositor.renderer, journey: this.journey, spec, params: spec.params || {}, seed, app: this });
      if (scene.init) await scene.init();
      this.scenes.push({ spec, scene });
    }

    this.overlay = new Overlay(this.root.querySelector('#overlay'), this);
    this.ui = new UI(this.root.querySelector('#ui'), this);
    this.ui.applyTexts();
    this.input = new Input({ el: this.root, app: this });
    this.input.attach();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());

    const fromHash = this.parseHash(location.hash);
    if (fromHash !== null) this.zoom.jump(fromHash);
    window.addEventListener('hashchange', () => {
      const p = this.parseHash(location.hash);
      if (p !== null && Math.abs(p - this.zoom.p) > 0.01) this.zoom.fly(p);
    });

    if (this.record) {
      const { Recorder } = await import('./record.js');
      this.recorder = new Recorder(this);
      this.compositor.adaptive = false;
      this.compositor.quality = 1;
      await this.recorder.init();
    }

    // Compile everything up front so that the first pass through each level does not stutter.
    try {
      for (const { scene } of this.scenes) if (scene.warmup) scene.warmup(this.compositor.renderer);
    } catch (e) { /* warm-up is best effort */ }

    requestAnimationFrame(this.frame);
    // the boot screen goes away after the first frame, or after a moment if frames are paused
    setTimeout(() => this.root.classList.remove('is-loading'), 1200);
  }

  fail(message) {
    this.root.classList.remove('is-loading');
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = message;
    this.root.appendChild(p);
  }

  resize() {
    if (this.record && this.recorder) {
      this.recorder.layout();
      return;
    }
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.setViewport(w, h, dpr);
  }

  setViewport(w, h, dpr) {
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.compositor.setSize(w * dpr, h * dpr);
    this.overlay.setSize(w, h, dpr);
    if (this.ui) this.ui.measure();
    this.dirty = true;
  }

  makeView(t, dt) {
    const p = this.zoom.p;
    const z = Math.max(p, this.zInner);
    const fov = Math.pow(10, z);
    const w = this.cssW;
    const h = this.cssH;
    const ref = Math.min(w, h);
    return {
      p, z, fov,
      final: clamp((this.zInner - p) / (this.zInner - this.pEnd), 0, 1),
      w, h, ref,
      pxPerM: ref / fov,
      dpr: this.dpr,
      t: this.timeOverride ?? t, dt,
      lang: this.i18n.lang,
      reduced: this.reduced,
      record: this.record,
      quality: this.compositor.quality,
    };
  }

  /** Scenes visible at z, outer first; the first one is drawn opaque. */
  layersFor(z) {
    const visible = [];
    for (const { spec, scene } of this.scenes) {
      const [zOuter, zInner] = spec.range;
      if (z > zOuter || z < zInner) continue;
      const opacity = spec.fadeIn ? smoothstep(spec.fadeIn[0], spec.fadeIn[1], z) : 1;
      if (opacity <= 0.002) continue;
      visible.push({ scene, spec, opacity });
    }
    let base = 0;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].opacity >= 0.998) { base = i; break; }
    }
    const out = visible.slice(base);
    if (out.length) out[0] = { ...out[0], opacity: 1 };
    return out;
  }

  frame(ms) {
    requestAnimationFrame(this.frame);
    if (this.recorder && this.recorder.exporting) return; // the exporter drives rendering itself
    const t = ms / 1000;
    const dt = this.lastT ? Math.min(0.1, Math.max(0, t - this.lastT)) : 1 / 60;
    this.lastT = t;

    if (this.recorder) this.recorder.tick(t, dt);
    else if (this.autopilot) this.autopilot.update(dt);
    const moved = this.zoom.update(dt, t);
    const view = this.makeView(t, dt);
    const layers = this.layersFor(view.z);
    this.currentLayers = layers;
    const animating = layers.some((l) => l.scene.isAnimating && l.scene.isAnimating(view));
    if (moved || animating || this.dirty || this.recorder) {
      this.compositor.render(layers, view);
      if (this.lastRenderT) this.compositor.sample((t - this.lastRenderT) * 1000, t);
      this.lastRenderT = t;
      if (this.recorder) this.recorder.composite(view, layers);
      else this.overlay.draw(view, layers);
      this.dirty = false;
      if (!this.booted) { this.booted = true; this.root.classList.remove('is-loading'); }
      this.fpsFrames++;
    } else {
      this.lastRenderT = 0;
    }
    if (t - this.fpsT > 1) {
      this.debugInfo.fps = Math.round(this.fpsFrames / (t - this.fpsT));
      this.fpsFrames = 0;
      this.fpsT = t;
    }
    if (!this.record) this.ui.update(view);
    this.view = view;
  }

  // ----- levels and navigation -----

  nearestStopIndex(p, current = -1) {
    if (p <= this.zInner) return this.stops.length - 1;
    let best = 0;
    let bd = Infinity;
    this.stops.forEach((s, i) => {
      const d = Math.abs(s.z - p);
      if (d < bd) { bd = d; best = i; }
    });
    if (current >= 0 && current !== best) {
      const dc = Math.abs(this.stops[current].z - p);
      if (dc < bd + 0.03) return current; // a little hysteresis
    }
    return best;
  }

  goToIndex(i, opts) {
    i = clamp(i, 0, this.stops.length - 1);
    this.zoom.fly(this.stops[i].z, opts);
  }

  goToEnd(opts) { this.zoom.fly(this.pEnd, opts); }

  step(dir) {
    const p = this.zoom.target;
    if (dir > 0) {
      const next = this.stops.find((s) => s.z < p - 0.02);
      if (next) this.zoom.fly(next.z); else this.goToEnd();
    } else {
      const prev = [...this.stops].reverse().find((s) => s.z > p + 0.02);
      if (prev) this.zoom.fly(prev.z);
    }
  }

  restart() {
    this.stopPlay();
    this.ui.closeCard();
    this.zoom.fly(this.pStart, { duration: Math.min(4.5, 1.2 + (this.pStart - this.zoom.p) * 0.35) });
  }

  zoomBackOut() {
    this.stopPlay();
    this.zoom.fly(this.pStart, { duration: 5.5 });
  }

  onUserInput() {
    this.stopPlay();
    this.ui.hideHint();
  }

  onStopChange(stop) {
    if (this.record) return;
    const hash = this.zoom.p < this.zInner - 0.5 * (this.zInner - this.pEnd) ? '#end' : `#level-${stop.id}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { /* file:// or sandbox */ }
    }
  }

  parseHash(hash) {
    if (!hash) return null;
    if (hash === '#end') return this.pEnd;
    const m = /^#level-([0-9a-z]+)$/i.exec(hash);
    if (!m) return null;
    const s = this.stopById(m[1].toLowerCase());
    return s ? s.z : null;
  }

  // ----- autopilot -----

  togglePlay() { if (this.playing) this.stopPlay(); else this.startPlay(); }

  startPlay() {
    if (this.zoom.p <= this.pEnd + 0.01) this.zoom.jump(this.pStart);
    this.ui.hideHint();
    this.ui.closeCard();
    this.playing = true;
    this.ui.setPlaying(true);
    const hold = this.journey.autopilot?.hold ?? 3.2;
    const app = this;
    let i = this.nearestStopIndex(this.zoom.p);
    let phase = Math.abs(this.zoom.p - this.stops[i].z) < 0.02 ? 'hold' : 'fly';
    let timer = 0;
    const flyTo = (idx) => {
      phase = 'flying';
      const target = idx < app.stops.length ? app.stops[idx].z : app.pEnd;
      const d = Math.abs(target - app.zoom.p);
      app.zoom.fly(target, {
        duration: 1.1 + d * 1.05,
        onDone: () => {
          if (!app.playing) return;
          if (idx >= app.stops.length) { app.stopPlay(); return; }
          phase = 'hold';
          timer = 0;
        },
      });
    };
    if (phase === 'fly') flyTo(i);
    this.autopilot = {
      update(dt) {
        if (phase !== 'hold') return;
        timer += dt;
        if (timer >= hold) { i += 1; flyTo(i); }
      },
    };
  }

  stopPlay() {
    if (!this.playing) return;
    this.playing = false;
    this.autopilot = null;
    if (this.zoom.flying) this.zoom.cancelFlight();
    this.ui.setPlaying(false);
  }

  // ----- language, sharing -----

  async setLanguage(lang) {
    await this.i18n.load(lang);
    rememberLanguage(lang);
    document.documentElement.lang = lang;
    this.ui.applyTexts();
    this.ui.setPlaying(this.playing);
    this.dirty = true;
  }

  shareUrl() {
    const stop = this.stops[this.ui.active] || this.stops[0];
    const hash = this.view && this.view.final > 0.5 ? '#end' : `#level-${stop.id}`;
    return `${location.origin}${location.pathname}${hash}`;
  }

  async share() {
    const url = this.shareUrl();
    const title = this.i18n.t('ui.title');
    const text = this.i18n.t(`${this.journey.id}.shareText`);
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.ui.toast(this.i18n.t('ui.copied'));
    } catch (e) {
      window.prompt(this.i18n.t('ui.copyPrompt'), url);
    }
  }

  discussUrl(title) {
    const repo = this.journey.repository;
    if (!repo) return null;
    return `${repo}/discussions/new?category=general&title=${encodeURIComponent(title)}`;
  }

  rotatable() {
    let w = 0;
    for (const l of this.currentLayers || []) if (l.scene.rotatable) w = Math.max(w, l.scene.rotatable(this.view) * l.opacity);
    return w;
  }

  rotate(dx, dy) {
    for (const l of this.currentLayers || []) if (l.scene.rotate) l.scene.rotate(dx, dy, this.view);
    this.dirty = true;
  }
}
