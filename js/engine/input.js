// Wheel, trackpad, touch, pinch and keyboard all feed the same zoom value.

import { clamp } from './math.js';

const WHEEL_K = 0.00032;       // decades of zoom per pixel of wheel scroll
const PINCH_WHEEL_K = 0.0045;  // ctrl + wheel, which is how trackpad pinches arrive in Chrome and Firefox
const TOUCH_DRAG_K = 0.0017;   // decades per pixel of vertical swipe
const MOUSE_DRAG_K = 0.0022;
const KEY_STEP = 0.07;

const UI_SELECTOR = 'button, a, input, .card, .ruler, .finale.is-on, .controls, .rec-panel';

export class Input {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    this.pointers = new Map();
    this.mode = null;
    this.samples = [];
    this.pinchDist = 0;
    this.gestureScale = 1;
    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKey = this.onKey.bind(this);
  }

  attach() {
    const el = this.el;
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
    // Safari sends trackpad pinches as gesture events rather than ctrl + wheel.
    el.addEventListener('gesturestart', (e) => { e.preventDefault(); this.gestureScale = e.scale || 1; });
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (this.pointers.size >= 2) return; // a touch pinch is already handled through pointer events
      const s = e.scale || 1;
      this.zoomBy(-Math.log10(s / this.gestureScale));
      this.gestureScale = s;
    });
    el.addEventListener('gestureend', (e) => e.preventDefault());
    el.addEventListener('contextmenu', (e) => { if (this.mode) e.preventDefault(); });
  }

  now() { return performance.now() / 1000; }

  zoomBy(dp) {
    if (!Number.isFinite(dp) || dp === 0) return;
    this.app.onUserInput();
    this.app.zoom.input(clamp(dp, -0.35, 0.35), this.now());
  }

  onWheel(e) {
    const card = e.target.closest && e.target.closest('.card');
    if (card && card.scrollHeight > card.clientHeight + 1) return; // let the card scroll
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    if (Math.abs(dy) < Math.abs(e.deltaX) && !e.ctrlKey) {
      // Horizontal two-finger swipes rotate the crystal when it is on screen.
      if (this.app.rotatable() > 0.5) { this.app.rotate(-e.deltaX * 0.6, 0); this.app.onUserInput(); }
      return;
    }
    this.zoomBy(e.ctrlKey ? dy * PINCH_WHEEL_K : -dy * WHEEL_K);
  }

  onPointerDown(e) {
    if (e.target.closest && e.target.closest(UI_SELECTOR)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, type: e.pointerType });
    if (this.pointers.size === 1) {
      this.mode = 'pending';
      this.samples = [];
      this.app.zoom.vel = 0;
    } else if (this.pointers.size === 2) {
      this.mode = 'pinch';
      this.pinchDist = this.distance();
    }
  }

  distance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  onPointerMove(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const dx = e.clientX - ptr.x;
    const dy = e.clientY - ptr.y;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const d = this.distance();
      if (this.pinchDist > 0 && d > 0) this.zoomBy(-Math.log10(d / this.pinchDist));
      this.pinchDist = d;
      return;
    }
    if (this.mode === 'pending') {
      const tx = e.clientX - ptr.x0;
      const ty = e.clientY - ptr.y0;
      if (Math.hypot(tx, ty) < 6) return;
      const canRotate = this.app.rotatable() > 0.5;
      this.mode = canRotate && (ptr.type === 'mouse' || Math.abs(tx) > Math.abs(ty) * 1.2) ? 'rotate' : 'zoom';
      this.app.onUserInput();
    }
    if (this.mode === 'rotate') {
      this.app.rotate(dx, dy);
    } else if (this.mode === 'zoom') {
      const k = ptr.type === 'mouse' ? MOUSE_DRAG_K : TOUCH_DRAG_K;
      const dp = dy * k;
      this.zoomBy(dp);
      const t = this.now();
      this.samples.push({ t, dp });
      while (this.samples.length && t - this.samples[0].t > 0.1) this.samples.shift();
    }
  }

  onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'zoom' && this.pointers.size === 0) {
      const t = this.now();
      const recent = this.samples.filter((s) => t - s.t < 0.1);
      if (recent.length >= 2 && t - recent[recent.length - 1].t < 0.06) {
        const sum = recent.reduce((a, s) => a + s.dp, 0);
        const dt = Math.max(0.016, t - recent[0].t);
        this.app.zoom.fling(sum / dt * 0.9, t);
      }
    }
    if (this.pointers.size === 0) this.mode = null;
    else if (this.pointers.size === 1) {
      // After a pinch the remaining finger should not jerk the view.
      const [p] = this.pointers.values();
      p.x0 = p.x; p.y0 = p.y;
      this.mode = 'pending';
      this.samples = [];
    }
  }

  onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const onButton = tag === 'BUTTON' || tag === 'A';
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': case '+': case '=':
        e.preventDefault(); this.zoomBy(-KEY_STEP); break;
      case 'ArrowUp': case 'ArrowLeft': case '-': case '_':
        e.preventDefault(); this.zoomBy(KEY_STEP); break;
      case 'PageDown':
        e.preventDefault(); this.app.onUserInput(); this.app.step(1); break;
      case 'PageUp':
        e.preventDefault(); this.app.onUserInput(); this.app.step(-1); break;
      case ' ':
        if (onButton) return;
        e.preventDefault(); this.app.onUserInput(); this.app.step(e.shiftKey ? -1 : 1); break;
      case 'Home':
        e.preventDefault(); this.app.onUserInput(); this.app.goToIndex(0); break;
      case 'End':
        e.preventDefault(); this.app.onUserInput(); this.app.goToEnd(); break;
      case 'Escape':
        this.app.ui.closeCard(); break;
      default: break;
    }
  }
}
