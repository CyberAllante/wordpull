// Geometry helpers for Word Pool.
// All glyph geometry lives in "letter units": cap height = 1, y grows downward.

export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

export const v = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a) => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Squared distance between two segments (p1-p2) and (q1-q2). */
export function segSegDist2(p1, p2, q1, q2) {
  const ux = p2.x - p1.x, uy = p2.y - p1.y;
  const vx = q2.x - q1.x, vy = q2.y - q1.y;
  const wx = p1.x - q1.x, wy = p1.y - q1.y;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const EPS = 1e-12;
  // degenerate cases: one or both segments are points
  if (a < EPS && c < EPS) return wx * wx + wy * wy;
  if (a < EPS) { const d1 = pointSegDist(p1, q1, q2); return d1 * d1; }
  if (c < EPS) { const d1 = pointSegDist(q1, p1, p2); return d1 * d1; }
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < EPS) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; }
  }
  const sc = Math.abs(sN) < EPS ? 0 : sN / sD;
  const tc = Math.abs(tN) < EPS ? 0 : tN / tD;
  const dx = wx + sc * ux - tc * vx;
  const dy = wy + sc * uy - tc * vy;
  return dx * dx + dy * dy;
}

/** Distance from point p to segment a-b. */
export function pointSegDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** Sample an (elliptical) arc into a polyline. Angles in degrees; sampling goes from a0 to a1. */
export function arcPts(cx, cy, rx, ry, a0, a1, steps) {
  const n = steps || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 10));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = deg(lerp(a0, a1, i / n));
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/** Concatenate polylines, dropping duplicated joints. */
export function joinPaths(...paths) {
  const out = [];
  for (const p of paths) {
    for (const pt of p) {
      const last = out[out.length - 1];
      if (!last || dist(last, pt) > 1e-6) out.push({ x: pt.x, y: pt.y });
    }
  }
  return out;
}

/** Arc length table for a polyline. */
export function polyLength(p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]);
  return L;
}

/** Point and unit tangent at arc-length s along polyline p (clamped). */
export function polyAt(p, s) {
  if (p.length === 1) return { pt: p[0], tan: { x: 0, y: -1 } };
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const d = dist(p[i - 1], p[i]);
    if (s <= acc + d || i === p.length - 1) {
      const t = d > 1e-9 ? clamp((s - acc) / d, 0, 1) : 0;
      return {
        pt: { x: lerp(p[i - 1].x, p[i].x, t), y: lerp(p[i - 1].y, p[i].y, t) },
        tan: norm(sub(p[i], p[i - 1])),
      };
    }
    acc += d;
  }
  return { pt: p[p.length - 1], tan: norm(sub(p[p.length - 1], p[p.length - 2])) };
}

export function bboxOf(polys) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const q of p) {
    if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}
