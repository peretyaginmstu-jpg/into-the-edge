// Video mode: ?record=1&ratio=4x5 hides the interface and flies the camera through the whole
// journey on a fixed timeline, with large captions drawn into the frame. The frame can be
// recorded with any screen recorder, or exported right here as an MP4 (WebCodecs),
// rendered frame by frame so that the result is smooth on any machine.

import { clamp, easeInOutSine, smoothstep } from './math.js';
import { formatValue, niceLength, formatLength } from './units.js';
import { Mp4Writer } from './mp4.js';

const RATIOS = { '4x5': [1080, 1350], '1x1': [1080, 1080], '9x16': [1080, 1920], '16x9': [1920, 1080] };
const GOLD = '#d6aa52';
const FG = '#ece8e0';
const FG3 = '#9a958c';

export class Recorder {
  constructor(app) {
    this.app = app;
    const ratio = app.params.get('ratio') || '4x5';
    [this.W, this.H] = RATIOS[ratio] || RATIOS['4x5'];
    this.fps = clamp(Number(app.params.get('fps')) || 60, 24, 60);
    this.hold = Number(app.params.get('hold')) || 3;
    this.time = 0;
    this.playing = false;
    this.exporting = false;
    this.timeline = this.buildTimeline();
  }

  async init() {
    const app = this.app;
    app.root.classList.add('is-record');
    const canvas = document.createElement('canvas');
    canvas.width = this.W;
    canvas.height = this.H;
    canvas.className = 'rec-frame';
    canvas.setAttribute('aria-label', 'Video frame');
    app.root.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    const gl = app.root.querySelector('#gl');
    gl.style.visibility = 'hidden';
    app.root.querySelector('#overlay').style.display = 'none';
    this.buildPanel();
    try {
      await Promise.all([
        document.fonts.load(`400 44px "IBM Plex Sans"`, 'AaЖж'),
        document.fonts.load(`500 26px "IBM Plex Mono"`, 'AaЖжµÅ'),
        document.fonts.load(`600 30px "IBM Plex Sans"`, 'AaЖж'),
      ]);
    } catch (e) { /* draw with fallbacks */ }
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); this.togglePlay(); }
      if (e.key === 'r' || e.key === 'R') this.exportVideo();
    });
    app.zoom.jump(this.timeline.at(0));
    if (app.params.get('autoplay') !== '0') setTimeout(() => this.play(), 900);
  }

  /** Holds at every level, eased flights between them, then the final screen. */
  buildTimeline() {
    const app = this.app;
    const segs = [];
    let t = 0;
    const stops = app.stops;
    for (let i = 0; i < stops.length; i++) {
      segs.push({ t0: t, t1: t + this.hold, from: stops[i].z, to: stops[i].z, stop: i });
      t += this.hold;
      const next = i + 1 < stops.length ? stops[i + 1].z : app.pEnd;
      const dz = Math.abs(next - stops[i].z);
      // the descent into the ion-beam pit gets more time
      const slow = stops[i].id === '2b' ? 1.8 : 1;
      const dur = (i + 1 < stops.length ? 1.0 + 1.05 * dz : 1.6) * slow;
      segs.push({ t0: t, t1: t + dur, from: stops[i].z, to: next, stop: -1 });
      t += dur;
    }
    segs.push({ t0: t, t1: t + 4.5, from: app.pEnd, to: app.pEnd, stop: -2 });
    t += 4.5;
    return {
      duration: t,
      segs,
      at(time) {
        const s = segs.find((x) => time < x.t1) || segs[segs.length - 1];
        const u = clamp((time - s.t0) / (s.t1 - s.t0), 0, 1);
        return s.from + (s.to - s.from) * easeInOutSine(u);
      },
      seg(time) { return segs.find((x) => time < x.t1) || segs[segs.length - 1]; },
    };
  }

  buildPanel() {
    const p = document.createElement('div');
    p.className = 'rec-panel';
    p.innerHTML = `<button class="btn" data-r="play"><span class="lbl">Play</span></button>
      <button class="btn btn-primary" data-r="export"><span class="lbl"></span></button>
      <span class="rec-status"></span>`;
    this.app.root.appendChild(p);
    this.panel = p;
    p.querySelector('[data-r="export"] .lbl').textContent = this.app.i18n.t('ui.record');
    p.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      if (b.dataset.r === 'play') this.togglePlay();
      else this.exportVideo();
    });
    this.status = p.querySelector('.rec-status');
    this.status.textContent = `${this.W}×${this.H} · ${Math.round(this.timeline.duration)} s · space = play, R = record`;
  }

  layout() {
    // the frame is rendered at full size and only scaled for display
    this.app.setViewport(this.W, this.H, 1);
    const s = Math.min((window.innerWidth - 24) / this.W, (window.innerHeight - 70) / this.H, 1);
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '50%', top: `${(window.innerHeight - 58 - this.H * s) / 2}px`,
      width: `${this.W * s}px`, height: `${this.H * s}px`, transform: 'translateX(-50%)',
    });
  }

  togglePlay() { if (this.playing) this.pause(); else this.play(); }
  play() {
    if (this.exporting) return;
    if (this.time >= this.timeline.duration) this.time = 0;
    this.playing = true;
    this.panel.querySelector('[data-r="play"] .lbl').textContent = 'Pause';
  }
  pause() {
    this.playing = false;
    this.panel.querySelector('[data-r="play"] .lbl').textContent = 'Play';
  }

  /** Called by the app before the zoom update of every animation frame. */
  tick(t, dt) {
    if (this.exporting) return;
    if (this.playing) {
      this.time = Math.min(this.timeline.duration, this.time + dt);
      if (this.time >= this.timeline.duration) this.pause();
    }
    this.app.zoom.jump(this.timeline.at(this.time));
    this.app.timeOverride = this.time;
  }

  /** Draws the WebGL picture, the outlines and the captions into the frame canvas. */
  composite(view, layers) {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.app.compositor.renderer.domElement, 0, 0, W, H);
    this.app.overlay.paint(ctx, view, layers, { fontScale: 1.65 });
    this.drawChrome(ctx, view);
  }

  drawChrome(ctx, view) {
    const app = this.app;
    const { W, H } = this;
    const i18n = app.i18n;
    const lang = i18n.lang;
    const m = Math.round(W * 0.06);
    // top band: title and scale bar
    let g = ctx.createLinearGradient(0, 0, 0, H * 0.16);
    g.addColorStop(0, 'rgba(11,12,14,0.6)');
    g.addColorStop(1, 'rgba(11,12,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.16);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = FG;
    ctx.font = '600 30px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillText(i18n.t('ui.title'), m, m + 22);
    // scale bar
    const lenM = niceLength((view.ref * 0.2) / view.pxPerM);
    const px = lenM * view.pxPerM;
    const sx = W - m - px;
    const sy = m + 14;
    ctx.strokeStyle = FG;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
    ctx.moveTo(sx, sy); ctx.lineTo(sx + px, sy);
    ctx.moveTo(sx + px, sy - 9); ctx.lineTo(sx + px, sy + 9);
    ctx.stroke();
    ctx.font = '500 26px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatLength(lenM, lang, 3), W - m, sy + 44);
    ctx.textAlign = 'left';

    // caption of the level we are resting at
    const seg = this.timeline.seg(this.time);
    const final = view.final;
    let idx = app.nearestStopIndex(view.p);
    let alpha = 0;
    if (seg.stop >= 0) {
      idx = seg.stop;
      const u = this.time - seg.t0;
      alpha = smoothstep(0, 0.45, u) * (1 - smoothstep(seg.t1 - seg.t0 - 0.35, seg.t1 - seg.t0, u));
    }
    const stop = app.stops[idx];
    const capH = H * 0.4;
    g = ctx.createLinearGradient(0, H - capH, 0, H);
    g.addColorStop(0, 'rgba(11,12,14,0)');
    g.addColorStop(0.45, 'rgba(11,12,14,0.72)');
    g.addColorStop(1, 'rgba(11,12,14,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - capH, W, capH);
    if (alpha > 0.01 && final < 0.3) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const text = i18n.t(`${app.journey.id}.levels.${stop.id}.caption`);
      ctx.font = '400 46px "IBM Plex Sans", system-ui, sans-serif';
      const lines = wrap(ctx, text, W - 2 * m);
      const lh = 62;
      let y = H - m - (lines.length - 1) * lh;
      ctx.font = '500 27px "IBM Plex Mono", ui-monospace, monospace';
      const kind = stop.transition ? i18n.t('ui.transition') : `${i18n.t('ui.level')} ${stop.id}`;
      ctx.fillStyle = FG3;
      ctx.fillText(kind.toUpperCase(), m, y - lh - 4);
      const kw = ctx.measureText(kind.toUpperCase()).width;
      ctx.fillStyle = GOLD;
      ctx.fillText(formatValue(stop.fov[0], stop.fov[1], lang), m + kw + 22, y - lh - 4);
      ctx.fillStyle = FG;
      ctx.font = '400 46px "IBM Plex Sans", system-ui, sans-serif';
      for (const line of lines) { ctx.fillText(line, m, y); y += lh; }
      ctx.restore();
    }
    // the final screen
    if (final > 0.01) {
      const a = smoothstep(0.1, 0.8, final);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(11,12,14,0.8)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = FG;
      ctx.font = '400 52px "IBM Plex Sans", system-ui, sans-serif';
      const lines = wrap(ctx, i18n.t(`${app.journey.id}.final.text`), W - 2.4 * m);
      const lh = 70;
      let y = H / 2 - ((lines.length - 1) * lh) / 2 - 40;
      for (const line of lines) { ctx.fillText(line, W / 2, y); y += lh; }
      ctx.font = '600 36px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillText(i18n.t(`${app.journey.id}.final.author`), W / 2, y + 60);
      ctx.font = '500 26px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = GOLD;
      const url = (app.journey.siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (url) ctx.fillText(url, W / 2, y + 112);
      ctx.restore();
    }
  }

  /** Renders every frame at a fixed rate and encodes it to MP4 with WebCodecs. */
  async exportVideo() {
    if (this.exporting) return;
    if (typeof VideoEncoder === 'undefined') { this.exportRealtime(); return; }
    const { W, H, fps } = this;
    const config = { codec: 'avc1.640033', width: W, height: H, bitrate: 8_000_000, framerate: fps, avc: { format: 'avc' } };
    let support;
    try { support = await VideoEncoder.isConfigSupported(config); } catch (e) { support = null; }
    if (!support || !support.supported) { this.exportRealtime(); return; }
    this.exporting = true;
    this.pause();
    const writer = new Mp4Writer({ width: W, height: H, fps });
    let failed = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => writer.add(chunk, meta), error: (e) => { failed = e; } });
    encoder.configure(config);
    const app = this.app;
    const total = Math.ceil(this.timeline.duration * fps);
    const t0 = performance.now();
    for (let i = 0; i < total && !failed; i++) {
      this.time = i / fps;
      app.zoom.jump(this.timeline.at(this.time));
      const view = app.makeView(this.time, 1 / fps);
      const layers = app.layersFor(view.z);
      app.compositor.render(layers, view);
      this.composite(view, layers);
      const frame = new VideoFrame(this.canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      if (encoder.encodeQueueSize > 4 || i % 15 === 0) {
        this.status.textContent = `${app.i18n.t('ui.recording')} ${Math.round((i / total) * 100)}%`;
        // yield through a message channel: timers are throttled when the tab is in the background
        while (encoder.encodeQueueSize > 4) await yieldTask();
        await yieldTask();
      }
    }
    await encoder.flush();
    encoder.close();
    this.exporting = false;
    if (failed) { this.status.textContent = `Encoder error: ${failed.message || failed}`; return; }
    const blob = writer.finish();
    const secs = ((performance.now() - t0) / 1000).toFixed(0);
    this.offer(blob, 'into-the-edge.mp4', `${(blob.size / 1e6).toFixed(1)} MB, ${secs} s`);
  }

  /** Fallback: plays the timeline in real time and captures the canvas stream. */
  exportRealtime() {
    if (typeof MediaRecorder === 'undefined' || !this.canvas.captureStream) {
      this.status.textContent = 'This browser cannot record video; use a screen recorder.';
      return;
    }
    const types = ['video/mp4;codecs=avc1.640033', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const stream = this.canvas.captureStream(this.fps);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: type || 'video/webm' });
      this.offer(blob, `into-the-edge.${type.includes('mp4') ? 'mp4' : 'webm'}`, `${(blob.size / 1e6).toFixed(1)} MB`);
    };
    this.time = 0;
    rec.start(500);
    this.play();
    this.status.textContent = this.app.i18n.t('ui.recording');
    const check = () => { if (this.playing) requestAnimationFrame(check); else rec.stop(); };
    requestAnimationFrame(check);
  }

  offer(blob, name, info) {
    const url = URL.createObjectURL(blob);
    this.status.innerHTML = '';
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.className = 'btn btn-primary';
    a.textContent = `${this.app.i18n.t('ui.saved')}: ${name} (${info})`;
    this.status.appendChild(a);
    a.click();
    if (this.app.params.get('save') === 'server') {
      fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob }).catch(() => {});
    }
  }
}

const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiting = [];
if (channel) channel.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
function yieldTask() {
  return new Promise((resolve) => {
    if (!channel) { setTimeout(resolve, 0); return; }
    waiting.push(resolve);
    channel.port2.postMessage(0);
  });
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
