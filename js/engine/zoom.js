// The whole view is a function of one number: p = log10(field of view in metres).
// Past the innermost level p keeps going for a short stretch that reveals the final screen.

import { clamp, easeInOutSine } from './math.js';

export class ZoomController {
  /**
   * @param {object} o
   * @param {number} o.start outermost value of p (largest)
   * @param {number} o.end innermost value of p (smallest, includes the final stretch)
   * @param {number[]} o.stops values of p where the view likes to rest
   */
  constructor({ start, end, stops, reducedMotion = false }) {
    this.start = start;
    this.end = end;
    this.stops = stops.slice().sort((a, b) => b - a);
    this.p = start;
    this.target = start;
    this.vel = 0;
    this.flight = null;
    this.reduced = reducedMotion;
    this.lastInput = -Infinity;
    this.snapPending = false;
    this.snapRadius = 0.13;
    this.smoothing = 8; // 1/s, the inertia of wheel and keys
  }

  clamp(v) { return clamp(v, this.end, this.start); }
  get flying() { return !!this.flight; }

  /** Relative user input (wheel, keys, drag). Cancels any automatic flight. */
  input(dp, now) {
    this.flight = null;
    this.vel = 0;
    this.target = this.clamp(this.target + dp);
    if (this.reduced) this.p = this.target;
    this.lastInput = now;
    this.snapPending = true;
  }

  /** Absolute scrub, e.g. dragging along the ruler. */
  scrub(p, now) {
    this.flight = null;
    this.vel = 0;
    this.target = this.clamp(p);
    if (this.reduced) this.p = this.target;
    this.lastInput = now;
    this.snapPending = true;
  }

  /** Momentum after a touch fling, in decades per second. */
  fling(v, now) {
    if (this.reduced) return;
    this.vel = clamp(v, -6, 6);
    this.lastInput = now;
    this.snapPending = true;
  }

  jump(p) {
    this.flight = null;
    this.vel = 0;
    this.p = this.target = this.clamp(p);
    this.snapPending = false;
  }

  /** Animated camera flight to p. With reduced motion the view simply cuts there. */
  fly(p, { duration, onDone, ease = easeInOutSine } = {}) {
    p = this.clamp(p);
    const d = Math.abs(p - this.p);
    if (this.reduced || d < 1e-4) {
      this.jump(p);
      if (onDone) onDone();
      return;
    }
    this.vel = 0;
    this.snapPending = false;
    this.flight = {
      from: this.p, to: p, t: 0,
      duration: duration ?? Math.min(7, 0.8 + d * 0.7),
      onDone, ease,
    };
  }

  cancelFlight() { this.flight = null; this.target = this.p; }

  nearestStop(p) {
    let best = this.stops[0];
    let bd = Infinity;
    for (const s of this.stops) {
      const d = Math.abs(s - p);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Advances the state; returns true when p changed. */
  update(dt, now) {
    const prev = this.p;
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const u = Math.min(1, f.t / f.duration);
      this.p = this.target = f.from + (f.to - f.from) * f.ease(u);
      if (u >= 1) {
        this.flight = null;
        if (f.onDone) f.onDone();
      }
      return this.p !== prev;
    }
    if (this.vel !== 0) {
      this.target = this.clamp(this.target + this.vel * dt);
      this.vel *= Math.exp(-dt / 0.34);
      if (Math.abs(this.vel) < 0.03 || this.target === this.start || this.target === this.end) this.vel = 0;
    }
    if (!this.reduced && this.snapPending && this.vel === 0 && now - this.lastInput > 0.45) {
      this.snapPending = false;
      const s = this.nearestStop(this.target);
      if (Math.abs(s - this.target) < this.snapRadius) this.target = s;
    }
    if (this.reduced) {
      this.p = this.target;
    } else {
      const k = 1 - Math.exp(-dt * this.smoothing);
      this.p += (this.target - this.p) * k;
      if (Math.abs(this.target - this.p) < 2e-5) this.p = this.target;
    }
    return this.p !== prev;
  }
}
