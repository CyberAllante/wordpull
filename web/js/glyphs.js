// Monoline "tube" alphabet for Word Pool.
// Every glyph is a set of strokes (polylines in letter units, cap height = 1, y down)
// plus one or more TRACKS: the stroke paths a player must "draw" to pull the letter out.
// A letter with no open track (O, o) is a closed letter and can only be popped.

import { arcPts, joinPaths, polyLength, bboxOf } from './geom.js';

export const STROKE_R = 0.11; // half thickness of a stroke, in letter units

const L = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y2 }];
const P = (...xy) => { const o = []; for (let i = 0; i < xy.length; i += 2) o.push({ x: xy[i], y: xy[i + 1] }); return o; };
const A = (cx, cy, rx, ry, a0, a1) => arcPts(cx, cy, rx, ry, a0, a1);
const J = joinPaths;
const DOT = (x, y) => [{ x, y }];
const ring = (cx, cy, rx, ry) => A(cx, cy, rx, ry, -90, 270);

// Each entry: { s: strokes, t: tracks (optional: defaults to every open stroke) }
const DEFS = {
  // ---------- capitals ----------
  A: () => { const lam = P(0, 1, 0.36, 0, 0.72, 1); return { s: [lam, L(0.14, 0.66, 0.58, 0.66)], t: [lam] }; },
  B: () => {
    const stem = L(0, 0, 0, 1);
    const up = J(L(0, 0, 0.28, 0), A(0.28, 0.25, 0.26, 0.25, -90, 90), L(0.28, 0.5, 0, 0.5));
    const lo = J(L(0, 0.5, 0.32, 0.5), A(0.32, 0.75, 0.28, 0.25, -90, 90), L(0.32, 1, 0, 1));
    return { s: [stem, up, lo], t: [stem] };
  },
  C: () => ({ s: [A(0.45, 0.5, 0.45, 0.5, -48, -312)] }),
  D: () => { const stem = L(0, 0, 0, 1); return { s: [stem, J(L(0, 0, 0.25, 0), A(0.25, 0.5, 0.45, 0.5, -90, 90), L(0.25, 1, 0, 1))], t: [stem] }; },
  E: () => ({ s: [L(0, 0, 0, 1), L(0, 0, 0.6, 0), L(0, 0.5, 0.48, 0.5), L(0, 1, 0.6, 1)], t: [P(0.6, 0, 0, 0, 0, 1, 0.6, 1)] }),
  F: () => ({ s: [L(0, 0, 0, 1), L(0, 0, 0.6, 0), L(0, 0.5, 0.45, 0.5)], t: [P(0.6, 0, 0, 0, 0, 1)] }),
  G: () => ({ s: [J(A(0.45, 0.5, 0.45, 0.5, -48, -360), L(0.9, 0.5, 0.5, 0.5))] }),
  H: () => { const l = L(0, 0, 0, 1), r = L(0.7, 0, 0.7, 1); return { s: [l, r, L(0, 0.5, 0.7, 0.5)], t: [l, r] }; },
  I: () => ({ s: [L(0, 0, 0, 1)] }),
  J: () => ({ s: [J(L(0.6, 0, 0.6, 0.68), A(0.3, 0.68, 0.3, 0.32, 0, 180))] }),
  K: () => { const stem = L(0, 0, 0, 1), d = P(0.62, 0, 0, 0.56, 0.66, 1); return { s: [stem, d], t: [stem, d] }; },
  L: () => ({ s: [P(0, 0, 0, 1, 0.6, 1)] }),
  M: () => ({ s: [P(0, 1, 0, 0, 0.42, 0.72, 0.84, 0, 0.84, 1)] }),
  N: () => ({ s: [P(0, 1, 0, 0, 0.7, 1, 0.7, 0)] }),
  O: () => ({ s: [ring(0.4, 0.5, 0.4, 0.5)], closed: [0] }),
  P: () => { const stem = L(0, 0, 0, 1); return { s: [stem, J(L(0, 0, 0.3, 0), A(0.3, 0.27, 0.28, 0.27, -90, 90), L(0.3, 0.54, 0, 0.54))], t: [stem] }; },
  Q: () => { const tail = L(0.5, 0.72, 0.86, 1.1); return { s: [ring(0.4, 0.5, 0.4, 0.5), tail], closed: [0], t: [tail] }; },
  R: () => {
    const stem = L(0, 0, 0, 1), leg = L(0.22, 0.54, 0.66, 1);
    return { s: [stem, J(L(0, 0, 0.3, 0), A(0.3, 0.27, 0.28, 0.27, -90, 90), L(0.3, 0.54, 0, 0.54)), leg], t: [stem, leg] };
  },
  S: () => ({ s: [J(A(0.33, 0.25, 0.27, 0.25, -30, -270), A(0.33, 0.75, 0.29, 0.25, -90, 150))] }),
  T: () => { const bar = L(0, 0, 0.7, 0), stem = L(0.35, 0, 0.35, 1); return { s: [bar, stem], t: [stem, bar] }; },
  U: () => ({ s: [J(L(0, 0, 0, 0.65), A(0.35, 0.65, 0.35, 0.35, 180, 0), L(0.7, 0.65, 0.7, 0))] }),
  V: () => ({ s: [P(0, 0, 0.36, 1, 0.72, 0)] }),
  W: () => ({ s: [P(0, 0, 0.23, 1, 0.46, 0.28, 0.69, 1, 0.92, 0)] }),
  X: () => ({ s: [L(0, 0, 0.7, 1), L(0.7, 0, 0, 1)] }),
  Y: () => ({ s: [P(0, 0, 0.35, 0.5, 0.7, 0), L(0.35, 0.5, 0.35, 1)], t: [P(0, 0, 0.35, 0.5, 0.35, 1), P(0.7, 0, 0.35, 0.5, 0.35, 1)] }),
  Z: () => ({ s: [P(0, 0, 0.7, 0, 0, 1, 0.7, 1)] }),

  // ---------- lowercase (x-height 0.4 .. 1, descender to 1.3) ----------
  a: () => { const stem = L(0.6, 0.4, 0.6, 1); return { s: [ring(0.3, 0.7, 0.3, 0.3), stem], closed: [0], t: [stem] }; },
  b: () => { const stem = L(0, 0, 0, 1); return { s: [stem, ring(0.3, 0.7, 0.3, 0.3)], closed: [1], t: [stem] }; },
  c: () => ({ s: [A(0.32, 0.7, 0.32, 0.3, -48, -312)] }),
  d: () => { const stem = L(0.6, 0, 0.6, 1); return { s: [ring(0.3, 0.7, 0.3, 0.3), stem], closed: [0], t: [stem] }; },
  e: () => ({ s: [J(L(0, 0.7, 0.62, 0.7), A(0.31, 0.7, 0.31, 0.3, 0, -320))] }),
  f: () => { const hook = J(L(0.1, 1, 0.1, 0.28), A(0.36, 0.28, 0.26, 0.28, 180, 300)); return { s: [hook, L(-0.04, 0.4, 0.4, 0.4)], t: [hook] }; },
  g: () => { const hook = J(L(0.6, 0.4, 0.6, 1.02), A(0.3, 1.02, 0.3, 0.28, 0, 160)); return { s: [ring(0.3, 0.7, 0.3, 0.3), hook], closed: [0], t: [hook] }; },
  h: () => {
    const stem = L(0, 0, 0, 1), arch = J(A(0.3, 0.7, 0.3, 0.3, 180, 360), L(0.6, 0.7, 0.6, 1));
    return { s: [stem, arch], t: [stem, J(L(0, 1, 0, 0.7), arch)] };
  },
  i: () => { const stem = L(0, 0.4, 0, 1); return { s: [stem, DOT(0, 0.1)], t: [stem] }; },
  j: () => { const hook = J(L(0.3, 0.4, 0.3, 1.02), A(0, 1.02, 0.3, 0.28, 0, 150)); return { s: [hook, DOT(0.3, 0.1)], t: [hook] }; },
  k: () => { const stem = L(0, 0, 0, 1), d = P(0.52, 0.4, 0.04, 0.7, 0.52, 1); return { s: [stem, d], t: [stem, d] }; },
  l: () => ({ s: [L(0, 0, 0, 1)] }),
  m: () => {
    const path = J(L(0, 1, 0, 0.65), A(0.25, 0.65, 0.25, 0.25, 180, 360), A(0.75, 0.65, 0.25, 0.25, 180, 360), L(1.0, 0.65, 1.0, 1));
    return { s: [path, L(0.5, 0.65, 0.5, 1)], t: [path] };
  },
  n: () => ({ s: [J(L(0, 1, 0, 0.68), A(0.3, 0.68, 0.3, 0.28, 180, 360), L(0.6, 0.68, 0.6, 1))] }),
  o: () => ({ s: [ring(0.3, 0.7, 0.3, 0.3)], closed: [0] }),
  p: () => { const stem = L(0, 0.4, 0, 1.3); return { s: [stem, ring(0.3, 0.7, 0.3, 0.3)], closed: [1], t: [stem] }; },
  q: () => { const stem = L(0.6, 0.4, 0.6, 1.3); return { s: [ring(0.3, 0.7, 0.3, 0.3), stem], closed: [0], t: [stem] }; },
  r: () => { const stem = L(0, 0.4, 0, 1), arch = A(0.26, 0.66, 0.26, 0.26, 180, 320); return { s: [stem, arch], t: [J(L(0, 1, 0, 0.66), arch)] }; },
  s: () => ({ s: [J(A(0.26, 0.55, 0.2, 0.15, -30, -270), A(0.26, 0.85, 0.22, 0.15, -90, 150))] }),
  t: () => { const hook = J(L(0.15, 0.08, 0.15, 0.74), A(0.4, 0.74, 0.25, 0.26, 180, 90)); return { s: [hook, L(-0.05, 0.4, 0.4, 0.4)], t: [hook] }; },
  u: () => { const cup = J(L(0, 0.4, 0, 0.7), A(0.3, 0.7, 0.3, 0.3, 180, 0), L(0.6, 0.7, 0.6, 0.4)); return { s: [cup, L(0.6, 0.7, 0.6, 1)], t: [cup] }; },
  v: () => ({ s: [P(0, 0.4, 0.3, 1, 0.6, 0.4)] }),
  w: () => ({ s: [P(0, 0.4, 0.2, 1, 0.4, 0.5, 0.6, 1, 0.8, 0.4)] }),
  x: () => ({ s: [L(0, 0.4, 0.6, 1), L(0.6, 0.4, 0, 1)] }),
  y: () => { const long = L(0.6, 0.4, 0.15, 1.3); return { s: [L(0, 0.4, 0.3, 1), long], t: [long, P(0, 0.4, 0.3, 1, 0.15, 1.3)] }; },
  z: () => ({ s: [P(0, 0.4, 0.6, 0.4, 0, 1, 0.6, 1)] }),
};

const cache = new Map();

/**
 * Returns a normalized glyph:
 * { ch, strokes:[{pts, closed}], tracks:[pts], segs:[[a,b]...], bbox, w, h, center, radius }
 * Coordinates are shifted so the stroke bounding box (including thickness) starts at (0,0).
 */
export function glyph(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const def = DEFS[ch];
  if (!def) throw new Error(`No glyph for '${ch}'`);
  const raw = def();
  const closedIdx = new Set(raw.closed || []);
  const strokesRaw = raw.s;
  const tracksRaw = raw.t || strokesRaw.filter((p, i) => !closedIdx.has(i) && p.length >= 2);

  const bb = bboxOf(strokesRaw);
  const ox = -(bb.minX - STROKE_R), oy = -(bb.minY - STROKE_R);
  const shift = (p) => p.map((q) => ({ x: q.x + ox, y: q.y + oy }));

  const strokes = strokesRaw.map((p, i) => ({ pts: shift(p), closed: closedIdx.has(i) }));
  const tracks = tracksRaw.map(shift);
  const segs = [];
  for (const s of strokes) {
    if (s.pts.length === 1) segs.push([s.pts[0], s.pts[0]]);
    for (let i = 1; i < s.pts.length; i++) segs.push([s.pts[i - 1], s.pts[i]]);
  }
  const w = bb.maxX - bb.minX + 2 * STROKE_R;
  const h = bb.maxY - bb.minY + 2 * STROKE_R;
  const center = { x: w / 2, y: h / 2 };
  const g = {
    ch, strokes, tracks, segs,
    trackLengths: tracks.map(polyLength),
    bbox: { minX: 0, minY: 0, maxX: w, maxY: h },
    w, h, center,
    radius: Math.hypot(w, h) / 2,
    baseline: oy + 1, // y of the baseline inside the glyph box
  };
  cache.set(ch, g);
  return g;
}

export const SUPPORTED = Object.keys(DEFS).join('');
export const hasGlyph = (ch) => Object.prototype.hasOwnProperty.call(DEFS, ch);
