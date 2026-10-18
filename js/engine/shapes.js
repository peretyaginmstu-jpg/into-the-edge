// Familiar objects for comparison, drawn as line illustrations at true scale.
// Each function draws around the origin of an already translated and rotated context:
//   s     CSS pixels per metre
//   size  the object's characteristic size in metres
//   reach how far (px) a long object such as a hair or DNA should extend
//   pen   draws a path as a bright line over a dark casing, so it reads on any picture
// It returns where its label belongs, in the same local coordinates.

const TAU = Math.PI * 2;

/** Bright lines with a soft dark casing underneath. */
export function makePen(ctx, scale = 1) {
  return {
    stroke(path, { width = 1.6, alpha = 1, casing = 1, dash = null } = {}) {
      const base = ctx.globalAlpha;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash.map((v) => v * scale));
      if (casing > 0) {
        ctx.globalAlpha = base * alpha * 0.5 * casing;
        ctx.strokeStyle = 'rgb(11, 12, 14)';
        ctx.lineWidth = (width + 3.2) * scale;
        ctx.stroke(path);
      }
      ctx.globalAlpha = base * alpha;
      ctx.strokeStyle = 'rgb(246, 242, 234)';
      ctx.lineWidth = width * scale;
      ctx.stroke(path);
      ctx.restore();
    },
    fill(path, { alpha = 1, color = 'rgb(246, 242, 234)' } = {}) {
      const base = ctx.globalAlpha;
      ctx.save();
      ctx.globalAlpha = base * alpha;
      ctx.fillStyle = color;
      ctx.fill(path);
      ctx.restore();
    },
  };
}

// a small deterministic random generator, so the drawings never flicker
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A human hair: a strand with overlapping cuticle scales, cortex fibres and a medulla. */
function hair(ctx, { s, size, reach, pen }) {
  const d = size * s;
  const r = d / 2;
  const edges = new Path2D();
  edges.moveTo(-reach, -r); edges.lineTo(reach, -r);
  edges.moveTo(-reach, r); edges.lineTo(reach, r);
  if (d > 6) {
    // a faint body so the strand reads as an object, not two lines
    const body = new Path2D();
    body.rect(-reach, -r, reach * 2, d);
    pen.fill(body, { alpha: 0.07 });
  }
  pen.stroke(edges, { width: 1.8 });
  if (d < 22) return { x: 0, y: r + 16 };
  const rnd = rand(7);
  // cuticle: irregular scale edges, their free ends pointing towards the tip
  const step = d * 0.13;
  const n = Math.ceil(reach / step);
  const scales = new Path2D();
  for (let i = -n; i <= n; i++) {
    const x0 = i * step + (rnd() - 0.5) * step * 0.5;
    scales.moveTo(x0, -r);
    const segs = 7;
    for (let k = 1; k <= segs; k++) {
      const u = k / segs;
      const y = -r + u * d;
      const bulge = Math.sin(u * Math.PI) * step * 0.55;
      const jag = (rnd() - 0.5) * step * 0.22;
      scales.lineTo(x0 + bulge + jag, y);
    }
  }
  pen.stroke(scales, { width: 1, alpha: 0.42, casing: 0.5 });
  if (d > 60) {
    // cortex fibres along the strand, and the medulla in the middle
    const fib = new Path2D();
    for (let k = 1; k < 6; k++) {
      const y = -r + (k / 6) * d + (rnd() - 0.5) * d * 0.04;
      if (Math.abs(y) < d * 0.08) continue;
      fib.moveTo(-reach, y); fib.lineTo(reach, y);
    }
    pen.stroke(fib, { width: 0.8, alpha: 0.16, casing: 0 });
    const med = new Path2D();
    med.moveTo(-reach, -d * 0.05); med.lineTo(reach, -d * 0.05);
    med.moveTo(-reach, d * 0.05); med.lineTo(reach, d * 0.05);
    pen.stroke(med, { width: 0.9, alpha: 0.3, casing: 0, dash: [10, 7] });
  }
  return { x: 0, y: r + 16 };
}

/** A red blood cell seen at an angle: a biconcave disc with its dimple and rim. */
function rbc(ctx, { s, size, pen }) {
  const D = size * s;
  const rx = D / 2;
  const ry = D * 0.22;
  const th = D * 0.085;
  const outline = new Path2D();
  outline.ellipse(0, 0, rx, ry, 0, Math.PI, TAU); // far half of the rim
  outline.ellipse(0, th, rx, ry, 0, 0, Math.PI); // near half, lowered by the thickness
  outline.moveTo(-rx, 0); outline.lineTo(-rx, th);
  outline.moveTo(rx, 0); outline.lineTo(rx, th);
  const body = new Path2D();
  body.ellipse(0, th / 2, rx, ry + th / 2, 0, 0, TAU);
  pen.fill(body, { alpha: 0.07 });
  pen.stroke(outline, { width: 1.8 });
  // the top edge of the rim, seen across the disc
  const rim = new Path2D();
  rim.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  pen.stroke(rim, { width: 1.3, alpha: 0.75 });
  // the central dimple and contour lines of the biconcave surface
  const dimple = new Path2D();
  dimple.ellipse(0, ry * 0.12, rx * 0.4, ry * 0.36, 0, 0, TAU);
  pen.stroke(dimple, { width: 1.3, alpha: 0.7 });
  const contours = new Path2D();
  for (const k of [0.58, 0.76]) contours.ellipse(0, ry * 0.06 * (1 - k), rx * k, ry * k * 0.92, 0, 0, TAU);
  pen.stroke(contours, { width: 0.9, alpha: 0.32, casing: 0, dash: [5, 6] });
  return { x: 0, y: -ry - 18 };
}

/** E. coli: a rod with a two-layer envelope, pili, a nucleoid and helical flagella. */
function ecoli(ctx, { s, size, pen }) {
  const L = size * s;
  const W = L * 0.42;
  const r = W / 2;
  const capsule = (inset) => {
    const p = new Path2D();
    const rr = r - inset;
    p.moveTo(-L / 2 + r, -rr);
    p.lineTo(L / 2 - r, -rr);
    p.arc(L / 2 - r, 0, rr, -Math.PI / 2, Math.PI / 2);
    p.lineTo(-L / 2 + r, rr);
    p.arc(-L / 2 + r, 0, rr, Math.PI / 2, (3 * Math.PI) / 2);
    p.closePath();
    return p;
  };
  const rnd = rand(11);
  if (L > 120) {
    // flagella: long helical filaments trailing from the cell
    const fl = new Path2D();
    const starts = [[-0.32, -1, -0.62], [-0.08, -1, -0.38], [0.2, 1, 0.42], [0.38, 1, 0.66], [-0.42, 1, 0.92]];
    for (const [fx, side, tilt] of starts) {
      const x0 = fx * L;
      const y0 = side * r * 0.96;
      const len = L * 1.25;
      const amp = W * 0.11;
      const waves = 3.4;
      const dx = -Math.cos(tilt);
      const dy = side * Math.abs(Math.sin(tilt));
      fl.moveTo(x0, y0);
      // the hook, then the helix
      const segs = 70;
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const w = Math.sin(u * waves * TAU) * amp * Math.min(1, u * 5);
        fl.lineTo(x0 + dx * u * len - dy * w, y0 + dy * u * len + dx * w * 0.6);
      }
    }
    pen.stroke(fl, { width: 1, alpha: 0.5, casing: 0.5 });
    // pili: short fibres all around the envelope
    const pili = new Path2D();
    const count = 46;
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const per = 2 * (L - W) + Math.PI * W;
      let t = u * per;
      let x; let y; let nx; let ny;
      if (t < L - W) { x = -L / 2 + r + t; y = -r; nx = 0; ny = -1; }
      else if ((t -= L - W) < Math.PI * r) { const a = -Math.PI / 2 + t / r; x = L / 2 - r + Math.cos(a) * r; y = Math.sin(a) * r; nx = Math.cos(a); ny = Math.sin(a); }
      else if ((t -= Math.PI * r) < L - W) { x = L / 2 - r - t; y = r; nx = 0; ny = 1; }
      else { t -= L - W; const a = Math.PI / 2 + t / r; x = -L / 2 + r + Math.cos(a) * r; y = Math.sin(a) * r; nx = Math.cos(a); ny = Math.sin(a); }
      const len = W * (0.1 + rnd() * 0.08);
      const bend = (rnd() - 0.5) * 0.6;
      pili.moveTo(x, y);
      pili.lineTo(x + (nx + bend * ny) * len, y + (ny - bend * nx) * len);
    }
    pen.stroke(pili, { width: 0.8, alpha: 0.45, casing: 0 });
  }
  const body = capsule(0);
  pen.fill(body, { alpha: 0.08 });
  pen.stroke(body, { width: 1.9 });
  if (L > 90) {
    pen.stroke(capsule(Math.max(2, W * 0.07)), { width: 1, alpha: 0.6 });
    // the nucleoid: a loose tangle of DNA in the middle of the cell
    const nuc = new Path2D();
    let px = -L * 0.2;
    let py = 0;
    nuc.moveTo(px, py);
    for (let i = 0; i < 60; i++) {
      const a = i * 0.7 + rnd() * 1.5;
      px = Math.max(-L * 0.26, Math.min(L * 0.26, px + Math.cos(a) * W * 0.08));
      py = Math.max(-r * 0.42, Math.min(r * 0.42, py + Math.sin(a) * W * 0.08));
      nuc.lineTo(px, py);
    }
    pen.stroke(nuc, { width: 0.9, alpha: 0.35, casing: 0 });
  }
  return { x: 0, y: -r - 18 };
}

/** Influenza virion: envelope, matrix layer, HA and NA spikes, and the 7 + 1 RNA segments. */
function virus(ctx, { s, size, pen }) {
  const R = (size * s) / 2;
  const env = new Path2D();
  env.arc(0, 0, R, 0, TAU);
  pen.fill(env, { alpha: 0.07 });
  pen.stroke(env, { width: 1.8 });
  const n = Math.max(24, Math.min(84, Math.round(R / 3)));
  const h = R * 0.15;
  const spikes = new Path2D();
  const heads = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (i % 3) * 0.01;
    const c = Math.cos(a);
    const si = Math.sin(a);
    const isNA = i % 5 === 2; // a minority of neuraminidase spikes
    spikes.moveTo(c * R, si * R);
    spikes.lineTo(c * (R + h), si * (R + h));
    if (R > 40) {
      const hx = c * (R + h);
      const hy = si * (R + h);
      if (isNA) {
        const k = h * 0.28;
        heads.rect(hx - k / 2, hy - k / 2, k, k);
      } else {
        const k = h * 0.22;
        heads.moveTo(hx - si * k, hy + c * k);
        heads.lineTo(hx + c * k * 1.2, hy + si * k * 1.2);
        heads.lineTo(hx + si * k, hy - c * k);
      }
    }
  }
  pen.stroke(spikes, { width: 1.2, alpha: 0.8, casing: 0.6 });
  if (R > 40) pen.stroke(heads, { width: 1, alpha: 0.75, casing: 0.4 });
  if (R > 30) {
    // the lipid bilayer and the matrix protein layer just beneath it
    const inner = new Path2D();
    inner.arc(0, 0, R * 0.95, 0, TAU);
    pen.stroke(inner, { width: 1, alpha: 0.55, casing: 0 });
    const m1 = new Path2D();
    m1.arc(0, 0, R * 0.88, 0, TAU);
    pen.stroke(m1, { width: 1, alpha: 0.4, casing: 0, dash: [3, 4] });
    // eight RNA segments, seven around one, seen end-on
    const rnp = new Path2D();
    const rr = R * 0.13;
    const ring = R * 0.31;
    rnp.moveTo(rr, 0);
    rnp.arc(0, 0, rr, 0, TAU);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      rnp.moveTo(Math.cos(a) * ring + rr, Math.sin(a) * ring);
      rnp.arc(Math.cos(a) * ring, Math.sin(a) * ring, rr, 0, TAU);
    }
    pen.stroke(rnp, { width: 1.1, alpha: 0.6, casing: 0.3 });
  }
  return { x: 0, y: R + h + 22 };
}

/** DNA double helix along the local y axis: two backbones and the base pairs between them. */
function dna(ctx, { s, size, reach, pen }) {
  const D = size * s;
  const P = D * 1.7; // drawn pitch
  const bw = Math.max(1.5, D * 0.09); // half width of a backbone ribbon
  const phaseB = 2.4; // offset of the second strand: unequal major and minor grooves
  const stepY = Math.max(1.5, P / 64);
  const xAt = (y, ph) => (D / 2 - bw) * Math.sin((y / P) * TAU + ph);
  const zAt = (y, ph) => Math.cos((y / P) * TAU + ph); // > 0: the near side
  // base pairs first, they sit between the strands
  const rungs = new Path2D();
  const rung = P / 10.5;
  for (let y = Math.floor(-reach / rung) * rung; y <= reach; y += rung) {
    const xa = xAt(y, 0);
    const xb = xAt(y, phaseB);
    const mid = (xa + xb) / 2 + (D * 0.02) * Math.sin(y);
    rungs.moveTo(xa, y); rungs.lineTo(mid - 1.2, y);
    rungs.moveTo(mid + 1.2, y); rungs.lineTo(xb, y);
  }
  pen.stroke(rungs, { width: 1, alpha: 0.45, casing: 0.3 });
  // each backbone as a ribbon; the far half is drawn fainter so the strands cross in depth
  for (const ph of [0, phaseB]) {
    const near = new Path2D();
    const far = new Path2D();
    let prevNear = null;
    for (let y = -reach; y <= reach; y += stepY) {
      const x = xAt(y, ph);
      const isNear = zAt(y, ph) > 0;
      const path = isNear ? near : far;
      if (prevNear !== isNear) { path.moveTo(x - bw, y); } else { path.lineTo(x - bw, y); }
      prevNear = isNear;
    }
    prevNear = null;
    for (let y = -reach; y <= reach; y += stepY) {
      const x = xAt(y, ph);
      const isNear = zAt(y, ph) > 0;
      const path = isNear ? near : far;
      if (prevNear !== isNear) { path.moveTo(x + bw, y); } else { path.lineTo(x + bw, y); }
      prevNear = isNear;
    }
    pen.stroke(far, { width: 1.2, alpha: 0.45, casing: 0.4 });
    pen.stroke(near, { width: 1.7, alpha: 1 });
  }
  return { x: D / 2 + 14, y: 0, align: 'left' };
}

/** Water molecule: the space-filling outline of O and two H, about 0.28 nm across,
 *  with the nuclei and the O–H bonds. */
function water(ctx, { s, size, pen }) {
  const W = size * s;
  const rO = 0.39 * W;
  const rH = 0.25 * W;
  const b = 0.32 * W;
  const half = (104.5 / 2) * (Math.PI / 180);
  const O = [0, -0.12 * W];
  const H1 = [-Math.sin(half) * b, O[1] + Math.cos(half) * b];
  const H2 = [Math.sin(half) * b, O[1] + Math.cos(half) * b];
  // where each hydrogen sphere cuts the oxygen sphere
  const cut = (A, ra, B, rb) => {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const d = Math.hypot(dx, dy);
    const a = (ra * ra - rb * rb + d * d) / (2 * d);
    const hh = Math.sqrt(Math.max(0, ra * ra - a * a));
    return { dir: Math.atan2(dy, dx), half: Math.atan2(hh, a), halfB: Math.atan2(hh, d - a) };
  };
  const c1 = cut(O, rO, H1, rH);
  const c2 = cut(O, rO, H2, rH);
  const outline = new Path2D();
  // oxygen: everything except the two caps covered by hydrogens
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const a0 = norm(c1.dir + c1.half);
  let a1 = norm(c2.dir - c2.half);
  if (a1 < a0) a1 += TAU;
  const b0 = norm(c2.dir + c2.half);
  let b1 = norm(c1.dir - c1.half);
  if (b1 < b0) b1 += TAU;
  outline.moveTo(O[0] + Math.cos(a0) * rO, O[1] + Math.sin(a0) * rO);
  outline.arc(O[0], O[1], rO, a0, a1);
  outline.moveTo(O[0] + Math.cos(b0) * rO, O[1] + Math.sin(b0) * rO);
  outline.arc(O[0], O[1], rO, b0, b1);
  for (const [Hc, c] of [[H1, c1], [H2, c2]]) {
    const back = c.dir + Math.PI;
    const s0 = back + c.halfB;
    const s1 = back - c.halfB + TAU;
    outline.moveTo(Hc[0] + Math.cos(s0) * rH, Hc[1] + Math.sin(s0) * rH);
    outline.arc(Hc[0], Hc[1], rH, s0, s1);
  }
  const body = new Path2D();
  body.arc(O[0], O[1], rO, 0, TAU);
  body.moveTo(H1[0] + rH, H1[1]); body.arc(H1[0], H1[1], rH, 0, TAU);
  body.moveTo(H2[0] + rH, H2[1]); body.arc(H2[0], H2[1], rH, 0, TAU);
  pen.fill(body, { alpha: 0.06 });
  pen.stroke(outline, { width: 1.9 });
  if (W > 60) {
    const inner = new Path2D();
    inner.arc(O[0], O[1], rO, 0, TAU);
    inner.moveTo(H1[0] + rH, H1[1]); inner.arc(H1[0], H1[1], rH, 0, TAU);
    inner.moveTo(H2[0] + rH, H2[1]); inner.arc(H2[0], H2[1], rH, 0, TAU);
    pen.stroke(inner, { width: 0.9, alpha: 0.35, casing: 0, dash: [3, 4] });
    const bonds = new Path2D();
    bonds.moveTo(H1[0], H1[1]); bonds.lineTo(O[0], O[1]); bonds.lineTo(H2[0], H2[1]);
    pen.stroke(bonds, { width: 1.3, alpha: 0.75, casing: 0.5 });
    // the H–O–H angle
    const ang = new Path2D();
    const ra = b * 0.38;
    const start = Math.atan2(H2[1] - O[1], H2[0] - O[0]);
    const end = Math.atan2(H1[1] - O[1], H1[0] - O[0]);
    ang.arc(O[0], O[1], ra, start, end);
    pen.stroke(ang, { width: 1, alpha: 0.55, casing: 0 });
    const nuclei = new Path2D();
    for (const [x, y, r] of [[O[0], O[1], 3.2], [H1[0], H1[1], 2.4], [H2[0], H2[1], 2.4]]) { nuclei.moveTo(x + r, y); nuclei.arc(x, y, r, 0, TAU); }
    pen.fill(nuclei, { alpha: 0.9 });
    if (W > 140) {
      ctx.save();
      ctx.fillStyle = 'rgb(246, 242, 234)';
      ctx.font = `500 ${Math.round(Math.min(18, W * 0.06))}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha *= 0.8;
      ctx.fillText('O', O[0], O[1] - rO * 0.45);
      ctx.fillText('H', H1[0] - rH * 0.35, H1[1] + rH * 0.45);
      ctx.fillText('H', H2[0] + rH * 0.35, H2[1] + rH * 0.45);
      ctx.restore();
    }
  }
  return { x: 0, y: W * 0.5 + 22 };
}

export const SHAPES = { hair, rbc, ecoli, virus, dna, water };
