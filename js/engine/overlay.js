// 2D layer on top of the WebGL picture: comparison outlines at true scale, their labels,
// and anything a scene wants to annotate. The same drawing code renders into the video frame.

import { SHAPES, makePen } from './shapes.js';
import { smoothstep } from './math.js';
import { toMetres } from './units.js';

export const OUTLINE = 'rgba(236, 232, 224, 0.78)';
export const LABEL = 'rgba(236, 232, 224, 0.92)';
export const LABEL_DIM = 'rgba(184, 178, 167, 0.95)';

export class Overlay {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.app = app;
    this.dpr = 1;
    this.items = app.journey.comparisons.map((c) => {
      const stops = c.stops.map((id) => app.stopById(id));
      return {
        ...c,
        sizeM: toMetres(c.size[0], c.size[1]),
        zFirst: stops[0].z,
        zLast: stops[stops.length - 1].z,
      };
    });
  }

  setSize(w, h, dpr) {
    if (!this.canvas) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  opacityOf(item, view) {
    const z = view.z;
    const fadeIn = smoothstep(item.zFirst + 0.55, item.zFirst + 0.18, z);
    const fadeOut = 1 - smoothstep(item.zLast - 0.16, item.zLast - 0.46, z);
    return fadeIn * fadeOut * (1 - smoothstep(0.05, 0.5, view.final));
  }

  /** Draws into this overlay's own canvas. */
  draw(view, layers) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paint(ctx, view, layers, { fontScale: 1 });
  }

  /** Paints into any context whose units are CSS pixels of the view. */
  paint(ctx, view, layers, { fontScale = 1 } = {}) {
    for (const layer of layers) {
      if (layer.scene.overlay) {
        ctx.save();
        layer.scene.overlay(ctx, view, layer.opacity, {
          fontScale,
          t: (key) => this.app.i18n.t(key),
          label: (text, x, y, opt) => this.label(ctx, text, x, y, { fontScale, view, ...opt }),
        });
        ctx.restore();
      }
    }
    const ref = view.ref;
    const ox = (view.w - ref) / 2;
    const oy = (view.h - ref) / 2;
    const portrait = view.h > view.w * 1.05;
    const reach = Math.hypot(view.w, view.h) * 1.2;
    for (const item of this.items) {
      const a = this.opacityOf(item, view);
      if (a < 0.01) continue;
      const draw = SHAPES[item.shape];
      if (!draw) continue;
      const at = (portrait && item.atPortrait) || item.at;
      const angle = ((portrait && item.anglePortrait !== undefined) ? item.anglePortrait : (item.angle || 0)) * Math.PI / 180;
      const x = ox + at[0] * ref;
      const y = oy + at[1] * ref;
      ctx.save();
      ctx.globalAlpha = a * (item.alpha ?? 1);
      ctx.translate(x, y);
      if (angle) ctx.rotate(angle);
      const lab = draw(ctx, { s: view.pxPerM, size: item.sizeM, reach, pen: makePen(ctx, fontScale) });
      ctx.restore();
      if (lab) {
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        let lx = x + lab.x * ca - lab.y * sa;
        let ly = y + lab.x * sa + lab.y * ca;
        const fixed = (portrait && item.labelAtPortrait) || item.labelAt;
        if (fixed) { lx = ox + fixed[0] * ref; ly = oy + fixed[1] * ref; lab.align = 'center'; }
        const text = this.app.i18n.t(`${this.app.journey.id}.compare.${item.label}`);
        this.label(ctx, text, lx, ly, { align: lab.align || 'center', alpha: a, fontScale, view });
      }
    }
  }

  label(ctx, text, x, y, { align = 'center', alpha = 1, fontScale = 1, view, color = LABEL } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const size = 12 * fontScale;
    ctx.font = `400 ${size}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    // keep labels inside the frame
    if (view) {
      const m = 12 * fontScale;
      const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      if (left < m) x += m - left;
      if (left + w > view.w - m) x -= left + w - (view.w - m);
      y = Math.min(view.h - m, Math.max(m, y));
    }
    // a soft dark halo keeps text legible on bright pictures
    ctx.lineWidth = 4 * fontScale;
    ctx.strokeStyle = 'rgba(11, 12, 14, 0.75)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
