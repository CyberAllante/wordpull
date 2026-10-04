// Monoline "rope" alphabet for Word Pool.
// Every glyph is ONE continuous path (letter units, cap height = 1, y down) that may double back on
// itself (the middle arm of an E, the crossbar of a T). The letter slides along that path like a rope
// through a groove and leaves through an OPEN end. Ends that finish inside the letter (the bowl of a
// P meeting its stem) are closed. A glyph with no open end (O, o) can only be popped.
// Dots (i, j) ride along rigidly attached to one end of the rope.

import { arcPts, joinPaths, polyLength, bboxOf } from './geom.js';

export const STROKE_R = 0.11; // half thickness of a stroke, in letter units

const P = (...xy) => { const o = []; for (let i = 0; i < xy.length; i += 2) o.push({ x: xy[i], y: xy[i + 1] }); return o; };
const A = (cx, cy, rx, ry, a0, a1) => arcPts(cx, cy, rx, ry, a0, a1);
const J = joinPaths;
const ring = (cx, cy, rx, ry, a0 = -90) => A(cx, cy, rx, ry, a0, a0 - 360);

// { p: path, open: [start, end], dots: [{ end: 'start'|'end', dx, dy }] }
const DEFS = {
  // ---------- capitals ----------
  A: () => ({ p: P(0, 1, 0.36, 0, 0.72, 1, 0.598, 0.66, 0.122, 0.66), open: [true, false] }),
  B: () => ({ p: J(P(0, 1, 0, 0, 0.28, 0), A(0.28, 0.25, 0.26, 0.25, -90, 90), P(0.28, 0.5, 0, 0.5, 0.32, 0.5), A(0.32, 0.75, 0.28, 0.25, -90, 90), P(0.32, 1, 0, 1)), open: [true, false] }),
  C: () => ({ p: A(0.45, 0.5, 0.45, 0.5, -48, -312), open: [true, true] }),
  D: () => ({ p: J(P(0, 1, 0, 0, 0.25, 0), A(0.25, 0.5, 0.45, 0.5, -90, 90), P(0.25, 1, 0, 1)), open: [true, false] }),
  E: () => ({ p: P(0.6, 0, 0, 0, 0, 0.5, 0.48, 0.5, 0, 0.5, 0, 1, 0.6, 1), open: [true, true] }),
  F: () => ({ p: P(0.6, 0, 0, 0, 0, 0.5, 0.45, 0.5, 0, 0.5, 0, 1), open: [true, true] }),
  G: () => ({ p: J(A(0.45, 0.5, 0.45, 0.5, -48, -360), P(0.9, 0.5, 0.5, 0.5)), open: [true, false] }),
  H: () => ({ p: P(0, 0, 0, 1, 0, 0.5, 0.7, 0.5, 0.7, 0, 0.7, 1), open: [true, true] }),
  I: () => ({ p: P(0, 0, 0, 1), open: [true, true] }),
  J: () => ({ p: J(P(0.6, 0, 0.6, 0.68), A(0.3, 0.68, 0.3, 0.32, 0, 180)), open: [true, true] }),
  K: () => ({ p: P(0, 0, 0, 1, 0, 0.56, 0.62, 0, 0, 0.56, 0.66, 1), open: [true, true] }),
  L: () => ({ p: P(0, 0, 0, 1, 0.6, 1), open: [true, true] }),
  M: () => ({ p: P(0, 1, 0, 0, 0.42, 0.72, 0.84, 0, 0.84, 1), open: [true, true] }),
  N: () => ({ p: P(0, 1, 0, 0, 0.7, 1, 0.7, 0), open: [true, true] }),
  O: () => ({ p: ring(0.4, 0.5, 0.4, 0.5), open: [false, false] }),
  P: () => ({ p: J(P(0, 1, 0, 0, 0.3, 0), A(0.3, 0.27, 0.28, 0.27, -90, 90), P(0.3, 0.54, 0, 0.54)), open: [true, false] }),
  Q: () => ({ p: J(P(0.92, 1.16, 0.6, 0.933), A(0.4, 0.5, 0.4, 0.5, 60, -300)), open: [true, false] }),
  R: () => ({ p: J(P(0, 1, 0, 0, 0.3, 0), A(0.3, 0.27, 0.28, 0.27, -90, 90), P(0.3, 0.54, 0, 0.54, 0.22, 0.54, 0.66, 1)), open: [true, true] }),
  S: () => ({ p: J(A(0.33, 0.25, 0.27, 0.25, -30, -270), A(0.33, 0.75, 0.29, 0.25, -90, 150)), open: [true, true] }),
  T: () => ({ p: P(0, 0, 0.7, 0, 0.35, 0, 0.35, 1), open: [true, true] }),
  U: () => ({ p: J(P(0, 0, 0, 0.65), A(0.35, 0.65, 0.35, 0.35, 180, 0), P(0.7, 0.65, 0.7, 0)), open: [true, true] }),
  V: () => ({ p: P(0, 0, 0.36, 1, 0.72, 0), open: [true, true] }),
  W: () => ({ p: P(0, 0, 0.23, 1, 0.46, 0.28, 0.69, 1, 0.92, 0), open: [true, true] }),
  X: () => ({ p: P(0, 0, 0.7, 1, 0.35, 0.5, 0.7, 0, 0, 1), open: [true, true] }),
  Y: () => ({ p: P(0, 0, 0.35, 0.5, 0.7, 0, 0.35, 0.5, 0.35, 1), open: [true, true] }),
  Z: () => ({ p: P(0, 0, 0.7, 0, 0, 1, 0.7, 1), open: [true, true] }),

  // ---------- lowercase (x-height 0.4 .. 1, descender to 1.3) ----------
  a: () => ({ p: J(P(0.6, 0.4, 0.6, 1, 0.6, 0.7), ring(0.3, 0.7, 0.3, 0.3, 0)), open: [true, false] }),
  b: () => ({ p: J(P(0, 0, 0, 1, 0, 0.7), ring(0.3, 0.7, 0.3, 0.3, 180)), open: [true, false] }),
  c: () => ({ p: A(0.32, 0.7, 0.32, 0.3, -48, -312), open: [true, true] }),
  d: () => ({ p: J(P(0.6, 0, 0.6, 1, 0.6, 0.7), ring(0.3, 0.7, 0.3, 0.3, 0)), open: [true, false] }),
  e: () => ({ p: J(P(0, 0.7, 0.62, 0.7), A(0.31, 0.7, 0.31, 0.3, 0, -320)), open: [false, true] }),
  f: () => ({ p: J(A(0.36, 0.28, 0.26, 0.28, 300, 180), P(0.1, 0.28, 0.1, 0.4, 0.42, 0.4, 0.1, 0.4, 0.1, 1)), open: [true, true] }),
  g: () => ({ p: J(ring(0.3, 0.7, 0.3, 0.3, 0), P(0.6, 0.7, 0.6, 1.02), A(0.3, 1.02, 0.3, 0.28, 0, 160)), open: [false, true] }),
  h: () => ({ p: J(P(0, 0, 0, 1, 0, 0.7), A(0.3, 0.7, 0.3, 0.3, 180, 360), P(0.6, 0.7, 0.6, 1)), open: [true, true] }),
  i: () => ({ p: P(0, 0.4, 0, 1), open: [true, true], dots: [{ end: 'start', dx: 0, dy: -0.3 }] }),
  j: () => ({ p: J(P(0.3, 0.4, 0.3, 1.02), A(0, 1.02, 0.3, 0.28, 0, 150)), open: [true, true], dots: [{ end: 'start', dx: 0, dy: -0.3 }] }),
  k: () => ({ p: P(0, 0, 0, 1, 0, 0.7, 0.52, 0.4, 0, 0.7, 0.52, 1), open: [true, true] }),
  l: () => ({ p: P(0, 0, 0, 1), open: [true, true] }),
  m: () => ({ p: J(P(0, 1, 0, 0.65), A(0.25, 0.65, 0.25, 0.25, 180, 360), P(0.5, 0.65, 0.5, 1, 0.5, 0.65), A(0.75, 0.65, 0.25, 0.25, 180, 360), P(1.0, 0.65, 1.0, 1)), open: [true, true] }),
  n: () => ({ p: J(P(0, 1, 0, 0.68), A(0.3, 0.68, 0.3, 0.28, 180, 360), P(0.6, 0.68, 0.6, 1)), open: [true, true] }),
  o: () => ({ p: ring(0.3, 0.7, 0.3, 0.3), open: [false, false] }),
  p: () => ({ p: J(P(0, 1.3, 0, 0.4, 0, 0.7), ring(0.3, 0.7, 0.3, 0.3, 180)), open: [true, false] }),
  q: () => ({ p: J(P(0.6, 1.3, 0.6, 0.4, 0.6, 0.7), ring(0.3, 0.7, 0.3, 0.3, 0)), open: [true, false] }),
  r: () => ({ p: J(P(0, 1, 0, 0.4, 0, 0.66), A(0.26, 0.66, 0.26, 0.26, 180, 320)), open: [true, true] }),
  s: () => ({ p: J(A(0.26, 0.55, 0.2, 0.15, -30, -270), A(0.26, 0.85, 0.22, 0.15, -90, 150)), open: [true, true] }),
  t: () => ({ p: J(P(0.15, 0.08, 0.15, 0.4, 0.4, 0.4, 0.15, 0.4, 0.15, 0.74), A(0.4, 0.74, 0.25, 0.26, 180, 90)), open: [true, true] }),
  u: () => ({ p: J(P(0, 0.4, 0, 0.7), A(0.3, 0.7, 0.3, 0.3, 180, 0), P(0.6, 0.7, 0.6, 0.4, 0.6, 1)), open: [true, true] }),
  v: () => ({ p: P(0, 0.4, 0.3, 1, 0.6, 0.4), open: [true, true] }),
  w: () => ({ p: P(0, 0.4, 0.2, 1, 0.4, 0.5, 0.6, 1, 0.8, 0.4), open: [true, true] }),
  x: () => ({ p: P(0, 0.4, 0.6, 1, 0.3, 0.7, 0.6, 0.4, 0, 1), open: [true, true] }),
  y: () => ({ p: P(0, 0.4, 0.3, 1, 0.6, 0.4, 0.3, 1, 0.15, 1.3), open: [true, true] }),
  z: () => ({ p: P(0, 0.4, 0.6, 0.4, 0, 1, 0.6, 1), open: [true, true] }),
};

const cache = new Map();

/**
 * Returns a normalized glyph:
 * { ch, path, L, openStart, openEnd, dots:[{end,dx,dy}], strokes:[{pts}], segs, bbox, w, h, center, radius, baseline }
 * Coordinates are shifted so the bounding box (including thickness and dots) starts at (0,0).
 */
export function glyph(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const def = DEFS[ch];
  if (!def) throw new Error(`No glyph for '${ch}'`);
  const raw = def();
  const dots = raw.dots || [];
  const rawPath = raw.p;
  const dotPts = dots.map((d) => { const e = d.end === 'start' ? rawPath[0] : rawPath[rawPath.length - 1]; return { x: e.x + d.dx, y: e.y + d.dy }; });
  const bb = bboxOf([rawPath, ...dotPts.map((q) => [q])]);
  const ox = -(bb.minX - STROKE_R), oy = -(bb.minY - STROKE_R);
  const shift = (p) => p.map((q) => ({ x: q.x + ox, y: q.y + oy }));
  const path = shift(rawPath);
  const dotsShifted = shift(dotPts);
  const strokes = [{ pts: path }, ...dotsShifted.map((q) => ({ pts: [q] }))];
  const segs = [];
  for (let i = 1; i < path.length; i++) segs.push([path[i - 1], path[i]]);
  for (const q of dotsShifted) segs.push([q, q]);
  const w = bb.maxX - bb.minX + 2 * STROKE_R;
  const h = bb.maxY - bb.minY + 2 * STROKE_R;
  const g = {
    ch, path, L: polyLength(path), openStart: !!raw.open[0], openEnd: !!raw.open[1], dots,
    strokes, segs,
    bbox: { minX: 0, minY: 0, maxX: w, maxY: h },
    w, h, center: { x: w / 2, y: h / 2 },
    radius: Math.hypot(w, h) / 2,
    baseline: oy + 1,
  };
  cache.set(ch, g);
  return g;
}

export const SUPPORTED = Object.keys(DEFS).join('');
export const hasGlyph = (ch) => Object.prototype.hasOwnProperty.call(DEFS, ch);
