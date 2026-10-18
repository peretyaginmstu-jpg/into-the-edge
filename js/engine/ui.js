// DOM interface: top controls, level ruler, scale bar, caption, researcher card,
// final screen, hint and toast. Everything here reads from the app state; nothing
// here owns the zoom.

import { clamp, smoothstep } from './math.js';
import { formatValue, niceLength, pickUnit, unitName, formatLength } from './units.js';

const ICON = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 3.1v9.8L12.6 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.4v9.2M10.8 3.4v9.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  restart: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.1 8.2a4.9 4.9 0 1 0 1.6-3.7"/><path d="M4.3 2.1v2.7H7"/></svg>',
  share: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.3V2.4M5.1 5.2 8 2.3l2.9 2.9"/><path d="M3.4 8.4v4.3c0 .5.4.9.9.9h7.4c.5 0 .9-.4.9-.9V8.4"/></svg>',
  plus: '<svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2v8M2 6h8"/></svg>',
  discuss: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.4 3.2h11.2v7.2H7.6l-3.1 2.6v-2.6H2.4z"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.2l4 4 4-4"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.active = -1;
    this.cardOpen = false;
    this.hintShown = true;
    this.finaleOn = false;
    this.last = {};
    this.build();
    this.bind();
  }

  t(key, vars) { return this.app.i18n.t(key, vars); }
  jt(key, vars) { return this.app.i18n.t(`${this.app.journey.id}.${key}`, vars); }

  build() {
    this.root.innerHTML = `
      <div class="scrim scrim-top" aria-hidden="true"></div>
      <div class="scrim scrim-bottom" aria-hidden="true"></div>
      <div class="finale-veil" aria-hidden="true"></div>
      <header class="top">
        <a class="brand" href="./"><span class="brand-name"></span><span class="brand-tag"></span></a>
        <div class="controls">
          <button class="btn" type="button" data-act="play" aria-pressed="false"><span class="ico">${ICON.play}</span><span class="lbl"></span></button>
          <button class="btn" type="button" data-act="restart">${ICON.restart}<span class="lbl"></span></button>
          <button class="btn btn-lang" type="button" data-act="lang"><span class="lang-opt" data-l="en">EN</span><span class="lang-sep" aria-hidden="true">/</span><span class="lang-opt" data-l="ru">RU</span></button>
          <button class="btn" type="button" data-act="share">${ICON.share}<span class="lbl"></span></button>
        </div>
      </header>
      <nav class="ruler"><div class="ruler-track"></div><div class="ruler-fill"></div><div class="ruler-items"></div><div class="ruler-marker"></div></nav>
      <div class="scalebar" aria-hidden="true"><div class="scalebar-label"></div><div class="scalebar-bar"></div><div class="scalebar-fov"></div></div>
      <section class="caption">
        <div class="card" id="card" hidden></div>
        <div class="caption-inner" aria-live="polite">
          <div class="caption-meta"><span class="lvl"></span><span class="fov"></span></div>
          <p class="caption-text"></p>
          <div class="caption-actions"><button class="link-btn" type="button" data-act="card" aria-expanded="false" aria-controls="card">${ICON.plus}<span></span></button></div>
        </div>
      </section>
      <div class="hint" aria-hidden="true"><span class="hint-ico"></span><span class="hint-text"></span></div>
      <section class="finale" aria-hidden="true">
        <p class="finale-text"></p>
        <div class="finale-author"></div>
        <div class="finale-links"></div>
        <div class="finale-actions">
          <button class="btn btn-primary" type="button" data-act="zoomout"><span class="lbl"></span></button>
          <button class="btn" type="button" data-act="share">${ICON.share}<span class="lbl"></span></button>
        </div>
      </section>
      <div class="footnote"></div>
      <div class="toast" role="status" aria-live="polite"></div>
      ${this.app.debug ? '<div class="debug"></div>' : ''}
    `;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      brandName: q('.brand-name'), brandTag: q('.brand-tag'),
      play: q('[data-act="play"]'), restart: q('[data-act="restart"]'), lang: q('[data-act="lang"]'),
      share: q('.controls [data-act="share"]'),
      ruler: q('.ruler'), rulerItems: q('.ruler-items'), rulerFill: q('.ruler-fill'), rulerMarker: q('.ruler-marker'), rulerTrack: q('.ruler-track'),
      scaleLabel: q('.scalebar-label'), scaleBar: q('.scalebar-bar'), scaleFov: q('.scalebar-fov'),
      caption: q('.caption'), captionInner: q('.caption-inner'), lvl: q('.caption-meta .lvl'), fov: q('.caption-meta .fov'),
      text: q('.caption-text'), cardBtn: q('[data-act="card"]'), card: q('.card'),
      hint: q('.hint'), hintIco: q('.hint-ico'), hintText: q('.hint-text'),
      finale: q('.finale'), finaleVeil: q('.finale-veil'), finaleText: q('.finale-text'), finaleAuthor: q('.finale-author'), finaleLinks: q('.finale-links'),
      zoomout: q('[data-act="zoomout"]'), finaleShare: q('.finale [data-act="share"]'),
      footnote: q('.footnote'), toast: q('.toast'), debug: q('.debug'),
    };
  }

  bind() {
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'play') this.app.togglePlay();
      else if (act === 'restart') this.app.restart();
      else if (act === 'lang') this.app.setLanguage(this.app.i18n.lang === 'en' ? 'ru' : 'en');
      else if (act === 'share') this.app.share();
      else if (act === 'card') this.toggleCard();
      else if (act === 'zoomout') this.app.zoomBackOut();
      else if (act === 'stop') { this.app.onUserInput(); this.app.goToIndex(Number(b.dataset.i)); }
      else if (act === 'end') { this.app.onUserInput(); this.app.goToEnd(); }
    });
    // Dragging along the ruler scrubs through the journey.
    const ruler = this.el.ruler;
    const scrub = (e) => {
      const r = this.el.rulerTrack.getBoundingClientRect();
      const u = clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1);
      this.app.onUserInput();
      this.app.zoom.scrub(this.app.pStart - u * (this.app.pStart - this.app.pEnd), performance.now() / 1000);
    };
    ruler.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ruler-stop')) return;
      e.preventDefault();
      try { ruler.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.scrubbing = true;
      scrub(e);
    });
    ruler.addEventListener('pointermove', (e) => { if (this.scrubbing) scrub(e); });
    const end = () => { this.scrubbing = false; };
    ruler.addEventListener('pointerup', end);
    ruler.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => this.measure());
  }

  measure() {
    this.rulerH = this.el.rulerTrack.getBoundingClientRect().height || 1;
  }

  /** Re-applies every text, called on start and when the language changes. */
  applyTexts() {
    const app = this.app;
    const lang = app.i18n.lang;
    this.el.brandName.textContent = this.t('ui.title');
    this.el.brandTag.textContent = this.jt('tagline');
    this.el.play.querySelector('.lbl').textContent = this.t(app.playing ? 'ui.pause' : 'ui.play');
    this.el.play.setAttribute('aria-label', this.t(app.playing ? 'ui.pause' : 'ui.play'));
    this.el.restart.querySelector('.lbl').textContent = this.t('ui.restart');
    this.el.restart.setAttribute('aria-label', this.t('ui.restart'));
    for (const o of this.el.lang.querySelectorAll('.lang-opt')) o.classList.toggle('is-on', o.dataset.l === lang);
    this.el.lang.setAttribute('aria-label', this.t('ui.switchLanguage'));
    this.el.lang.setAttribute('lang', lang === 'en' ? 'ru' : 'en');
    for (const b of this.root.querySelectorAll('[data-act="share"]')) {
      b.querySelector('.lbl').textContent = this.t('ui.share');
      b.setAttribute('aria-label', this.t('ui.share'));
    }
    this.el.zoomout.querySelector('.lbl').textContent = this.t('ui.zoomBackOut');
    this.el.footnote.textContent = this.t('ui.footnote');
    this.el.ruler.setAttribute('aria-label', this.t('ui.levels'));
    const touch = matchMedia('(pointer: coarse)').matches;
    this.el.hintIco.innerHTML = touch ? ICON.up : ICON.down;
    this.el.hintText.textContent = this.t(touch ? 'ui.hintTouch' : 'ui.hintWheel');
    // finale
    this.el.finaleText.textContent = this.jt('final.text');
    this.el.finaleAuthor.textContent = this.jt('final.author');
    const links = (app.journey.author.links || []).filter((l) => l.url);
    this.el.finaleLinks.innerHTML = links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(this.t(`ui.${l.id}`))}</a>`).join('');
    this.buildRuler(lang);
    const i = this.active;
    this.active = -1;
    if (i >= 0) this.setActive(i, true);
    this.measure();
    this.last = {};
  }

  buildRuler(lang) {
    const app = this.app;
    const span = app.pStart - app.pEnd;
    let html = '';
    for (let d = Math.ceil(app.pEnd); d <= Math.floor(app.pStart); d++) {
      html += `<span class="ruler-minor" style="top:${((app.pStart - d) / span) * 100}%"></span>`;
    }
    app.stops.forEach((s, i) => {
      const label = formatValue(s.fov[0], s.fov[1], lang);
      const name = this.jt(`levels.${s.id}.name`);
      const kind = s.transition ? this.t('ui.transition') : `${this.t('ui.level')} ${s.id}`;
      html += `<button class="ruler-stop${s.transition ? ' is-minor' : ''}" type="button" data-act="stop" data-i="${i}" style="top:${((app.pStart - s.z) / span) * 100}%" aria-label="${esc(`${kind}: ${name}, ${label}`)}" title="${esc(`${kind} · ${name}`)}"><span>${esc(label)}</span></button>`;
    });
    html += `<button class="ruler-stop is-minor" type="button" data-act="end" style="top:100%" aria-label="${esc(this.t('ui.end'))}" title="${esc(this.t('ui.end'))}"><span>${esc(this.t('ui.endShort'))}</span></button>`;
    this.el.rulerItems.innerHTML = html;
    this.stopButtons = [...this.el.rulerItems.querySelectorAll('[data-act="stop"]')];
  }

  /** Called every frame; touches the DOM only when something visible changes. */
  update(view) {
    const app = this.app;
    const L = this.last;
    // ruler marker
    const u = (app.pStart - view.p) / (app.pStart - app.pEnd);
    const y = Math.round(u * this.rulerH * 10) / 10;
    if (L.y !== y) {
      L.y = y;
      this.el.rulerMarker.style.transform = `translateY(${y}px)`;
      this.el.rulerFill.style.height = `${y}px`;
    }
    // scale bar: a round length close to a fifth of the reference frame
    const lenM = niceLength((view.ref * 0.2) / view.pxPerM);
    const px = Math.round(lenM * view.pxPerM * 10) / 10;
    if (L.bar !== px) { L.bar = px; this.el.scaleBar.style.width = `${px}px`; }
    const lang = app.i18n.lang;
    const label = formatLength(lenM, lang, 3);
    if (L.barLabel !== label) { L.barLabel = label; this.el.scaleLabel.textContent = label; }
    const fovText = `${this.t('ui.fov')} ${this.formatFov(view.fov, lang)}`;
    if (L.fovText !== fovText) { L.fovText = fovText; this.el.scaleFov.textContent = fovText; }
    // active level
    const i = app.nearestStopIndex(view.p, this.active);
    if (i !== this.active) this.setActive(i);
    if (this.hintShown && view.p < app.pStart - 0.15) this.hideHint();
    // final screen
    const f = smoothstep(0.25, 0.85, view.final);
    const fr = Math.round(f * 100) / 100;
    if (L.finale !== fr) {
      L.finale = fr;
      this.el.finale.style.opacity = fr;
      this.el.finaleVeil.style.opacity = Math.round(smoothstep(0.1, 0.8, view.final) * 100) / 100;
      this.el.caption.style.opacity = String(1 - smoothstep(0.05, 0.4, view.final));
      this.el.caption.style.visibility = view.final > 0.45 ? 'hidden' : '';
      const on = fr > 0.5;
      if (on !== this.finaleOn) {
        this.finaleOn = on;
        this.el.finale.classList.toggle('is-on', on);
        this.el.finale.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (on) this.closeCard();
      }
    }
    if (this.el.debug) {
      const d = app.debugInfo || {};
      this.el.debug.textContent = `fps ${d.fps || 0}  q ${app.compositor.quality.toFixed(2)}\np ${view.p.toFixed(3)}  z ${view.z.toFixed(3)}\nfov ${formatLength(view.fov, 'en', 3)}  final ${view.final.toFixed(2)}`;
    }
  }

  formatFov(m, lang) {
    const unit = pickUnit(m * 1.0000001);
    const factor = { m: 1, cm: 1e-2, mm: 1e-3, um: 1e-6, nm: 1e-9, A: 1e-10 }[unit];
    const v = m / factor;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    const rounded = Number(v.toPrecision(2));
    return formatValue(rounded, unit, lang, digits);
  }

  setActive(i, force = false) {
    if (i === this.active && !force) return;
    const first = this.active < 0;
    this.active = i;
    const app = this.app;
    const stop = app.stops[i];
    this.stopButtons.forEach((b, k) => b.classList.toggle('is-active', k === i));
    const apply = () => {
      const lang = app.i18n.lang;
      this.el.lvl.textContent = stop.transition ? this.t('ui.transition') : `${this.t('ui.level')} ${stop.id}`;
      this.el.fov.textContent = formatValue(stop.fov[0], stop.fov[1], lang);
      this.el.text.textContent = this.jt(`levels.${stop.id}.caption`);
      const hasCard = !!stop.card;
      this.el.cardBtn.querySelector('span').textContent = this.t(hasCard ? 'ui.forResearchers' : 'ui.sources');
      this.renderCard(stop);
    };
    if (first || force || app.reduced) {
      apply();
    } else {
      this.el.caption.classList.add('is-swapping');
      clearTimeout(this.swapTimer);
      this.swapTimer = setTimeout(() => {
        apply();
        this.el.caption.classList.remove('is-swapping');
      }, 180);
    }
    app.onStopChange(stop);
  }

  renderCard(stop) {
    const app = this.app;
    const refs = (ids) => `<ul class="refs">${ids.map((id) => {
      const s = app.source(id);
      return s ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.text)}</a></li>` : '';
    }).join('')}</ul>`;
    let html = '';
    if (stop.card) {
      html += `<h3>${esc(this.t('ui.method'))}</h3><p>${esc(this.jt(`cards.${stop.id}.method`))}</p>`;
      html += `<h3>${esc(this.t('ui.question'))}</h3><p class="q">${esc(this.jt(`cards.${stop.id}.question`))}</p>`;
      html += `<h3>${esc(this.t('ui.reference'))}</h3>${refs(stop.card)}`;
    }
    if (stop.sources && stop.sources.length) {
      html += `<h3>${esc(this.t(stop.card ? 'ui.levelSources' : 'ui.sources'))}</h3>${refs(stop.sources)}`;
    }
    const title = `${stop.transition ? this.t('ui.transition') : `${this.t('ui.level')} ${stop.id}`}: ${this.jt(`levels.${stop.id}.name`)}`;
    const discuss = app.discussUrl(title);
    if (discuss) {
      html += `<div class="card-foot"><a class="discuss" href="${esc(discuss)}" target="_blank" rel="noopener">${ICON.discuss}<span>${esc(this.t('ui.discuss'))}</span></a></div>`;
    }
    this.el.card.innerHTML = html;
    this.el.card.setAttribute('aria-label', title);
  }

  toggleCard(force) {
    this.cardOpen = force ?? !this.cardOpen;
    this.el.card.hidden = !this.cardOpen;
    this.el.cardBtn.setAttribute('aria-expanded', String(this.cardOpen));
    if (this.cardOpen) this.el.card.scrollTop = 0;
  }

  closeCard() { if (this.cardOpen) this.toggleCard(false); }

  setPlaying(on) {
    this.el.play.setAttribute('aria-pressed', String(on));
    this.el.play.querySelector('.ico').innerHTML = on ? ICON.pause : ICON.play;
    this.el.play.querySelector('.lbl').textContent = this.t(on ? 'ui.pause' : 'ui.play');
    this.el.play.setAttribute('aria-label', this.t(on ? 'ui.pause' : 'ui.play'));
  }

  hideHint() {
    if (!this.hintShown) return;
    this.hintShown = false;
    this.el.hint.classList.add('is-hidden');
  }

  toast(text) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('is-on'), 1800);
  }
}

export { unitName };
