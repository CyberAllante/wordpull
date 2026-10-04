// Word Pool core engine: rope pieces, pull directions, collision, exits and the solver.
//
// A letter is a rope lying in a groove shaped like itself. Pulling an open end slides the rope
// along its own path and then straight out along the tangent of that end (the "rail" = path + ray).
// At progress s the rope occupies rail arc-length [s, s + L].
import { segSegDist2, polyLength, sub, norm } from './geom.js';
import { glyph, STROKE_R } from './glyphs.js';

export const CLEARANCE = 0.05;   // min gap between stroke surfaces when placing letters
export const TOUCH = 0.22;        // surfaces closer than this are "touching" (letter is locked)
export const STEP = 0.025;        // sweep sampling step (letter units)
const RAY = 14;                   // straight run appended beyond an open end

/** Cumulative arc lengths of a polyline. */
function cumLengths(p) {
  const c = [0];
  for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  return c;
}
/** Point and unit tangent at arc length u on a polyline with cumulative table c. */
function at(p, c, u) {
  const L = c[c.length - 1];
  if (u <= 0) return { x: p[0].x, y: p[0].y, tx: p[1].x - p[0].x, ty: p[1].y - p[0].y, i: 0 };
  if (u >= L) { const n = p.length - 1; return { x: p[n].x, y: p[n].y, tx: p[n].x - p[n - 1].x, ty: p[n].y - p[n - 1].y, i: n - 1 }; }
  // binary search segment
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= u) lo = mid; else hi = mid; }
  const d = c[hi] - c[lo], t = d > 1e-12 ? (u - c[lo]) / d : 0;
  return { x: p[lo].x + (p[hi].x - p[lo].x) * t, y: p[lo].y + (p[hi].y - p[lo].y) * t, tx: p[hi].x - p[lo].x, ty: p[hi].y - p[lo].y, i: lo };
}
/** Sub-polyline of p between arc lengths a and b (a < b). */
function subPoly(p, c, a, b) {
  const A = at(p, c, a), B = at(p, c, b);
  const out = [{ x: A.x, y: A.y }];
  for (let i = A.i + 1; i <= B.i; i++) out.push(p[i]);
  const last = out[out.length - 1];
  if (Math.hypot(B.x - last.x, B.y - last.y) > 1e-9) out.push({ x: B.x, y: B.y });
  return out;
}

/** Build the pull direction for one open end of a glyph. */
function buildDir(g, end) {
  const base = end === 'end' ? g.path : g.path.slice().reverse();
  const n = base.length - 1;
  const t = norm(sub(base[n], base[n - 1]));
  const rail = base.concat([{ x: base[n].x + t.x * RAY, y: base[n].y + t.y * RAY }]);
  const c = cumLengths(rail);
  const L = g.L;
  const dots = g.dots.map((d) => ({ u: d.end === end ? L : 0, dx: d.dx, dy: d.dy }));
  const dir = {
    end, rail, c, L, railL: c[c.length - 1],
    headPt0: { x: base[n].x, y: base[n].y },  // where the open end sits at rest
    exitTan: t,
    /** rail point (glyph-local) at arc length u */
    railAt(u) { const q = at(rail, c, u); return { x: q.x, y: q.y }; },
    tanAt(u) { const q = at(rail, c, u); return norm({ x: q.tx, y: q.ty }); },
    headAt(s) { return this.railAt(L + s); },
    /** rope body at progress s: polyline + dot positions (glyph-local) */
    bodyAt(s) {
      const pts = subPoly(rail, c, s, s + L);
      const dd = dots.map((d) => { const q = at(rail, c, d.u + s); return { x: q.x + d.dx, y: q.y + d.dy }; });
      return { pts, dots: dd };
    },
  };
  return dir;
}

/** A letter sitting in the pool. */
export class Piece {
  constructor(ch, pos, color) {
    this.ch = ch;
    this.g = glyph(ch);
    this.pos = { x: pos.x, y: pos.y };
    this.color = color;
    this.removed = false;
    this.dirs = [];
    if (this.g.openEnd) this.dirs.push(buildDir(this.g, 'end'));
    if (this.g.openStart) this.dirs.push(buildDir(this.g, 'start'));
  }
  get center() { return { x: this.pos.x + this.g.center.x, y: this.pos.y + this.g.center.y }; }
  get closed() { return this.dirs.length === 0; }
  /** World-space segments at rest (cached; recomputed when the piece moves). */
  restSegs() {
    if (!this._rest || this._rest.x !== this.pos.x || this._rest.y !== this.pos.y) {
      const dx = this.pos.x, dy = this.pos.y;
      this._rest = { x: dx, y: dy, segs: this.g.segs.map(([a, b]) => [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }]) };
    }
    return this._rest.segs;
  }
  /** World-space segments of the rope body at progress s along dir. */
  segsAt(dir, s) {
    const { pts, dots } = dir.bodyAt(s);
    const dx = this.pos.x, dy = this.pos.y;
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push([{ x: pts[i - 1].x + dx, y: pts[i - 1].y + dy }, { x: pts[i].x + dx, y: pts[i].y + dy }]);
    for (const q of dots) segs.push([{ x: q.x + dx, y: q.y + dy }, { x: q.x + dx, y: q.y + dy }]);
    return segs;
  }
  bboxAt() { return { minX: this.pos.x, minY: this.pos.y, maxX: this.pos.x + this.g.w, maxY: this.pos.y + this.g.h }; }
}

function segsBounds(segs) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [a, b] of segs) {
    if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x; if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
    if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x; if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: Math.hypot(maxX - minX, maxY - minY) / 2 };
}

/** Do world segments `segs` (with bounds `b`) come within `gap` of resting piece `o`? */
function segsNearPiece(segs, b, o, gap) {
  const oc = o.center;
  const reach = b.r + o.g.radius + 2 * STROKE_R + gap;
  const dx = b.cx - oc.x, dy = b.cy - oc.y;
  if (dx * dx + dy * dy > reach * reach) return false;
  const sb = o.restSegs();
  const lim = (2 * STROKE_R + gap) ** 2;
  for (let i = 0; i < segs.length; i++) {
    const p1 = segs[i][0], p2 = segs[i][1];
    for (let j = 0; j < sb.length; j++) if (segSegDist2(p1, p2, sb[j][0], sb[j][1]) < lim) return true;
  }
  return false;
}
/** Does resting piece `a` come within `gap` of resting piece `b`? */
export function piecesWithin(a, b, gap) {
  const segs = a.restSegs();
  return segsNearPiece(segs, segsBounds(segs), b, gap);
}

export class Board {
  constructor(w, h) { this.w = w; this.h = h; this.pieces = []; }
  get active() { return this.pieces.filter((p) => !p.removed); }
  get remaining() { return this.pieces.reduce((n, p) => n + (p.removed ? 0 : 1), 0); }

  insidePool(piece) {
    const b = piece.bboxAt();
    return b.minX >= 0 && b.minY >= 0 && b.maxX <= this.w && b.maxY <= this.h;
  }
  /** Are these world segments (a rope body) entirely outside the pool? */
  segsOutside(segs) {
    const b = segsBounds(segs);
    const R = STROKE_R;
    return b.maxX + R <= 0 || b.minX - R >= this.w || b.maxY + R <= 0 || b.minY - R >= this.h;
  }
  /** Index of the first active piece within `gap` of `segs` (ignoring `piece` itself), or -1. */
  colliderSegs(piece, segs, gap = 0) {
    const b = segsBounds(segs);
    for (let i = 0; i < this.pieces.length; i++) {
      const o = this.pieces[i];
      if (o === piece || o.removed) continue;
      if (segsNearPiece(segs, b, o, gap)) return i;
    }
    return -1;
  }
  /** Collider of a piece at rest (used for placement and touch tests). */
  collider(piece, gap = 0) { return this.colliderSegs(piece, piece.restSegs(), gap); }
  /** Is the piece touching nothing? (then it can be popped straight out) */
  isFree(piece) { return this.collider(piece, TOUCH) < 0; }
  /**
   * Sweep a rope along a pull direction.
   * Returns { sExit, sBlock, blocker } where sBlock = Infinity if the path is clear to the exit.
   */
  sweep(piece, dir) {
    const maxS = dir.L + Math.hypot(this.w, this.h) + 2;
    let prev = 0;
    for (let s = STEP; s <= maxS; s += STEP) {
      const segs = piece.segsAt(dir, s);
      const hit = this.colliderSegs(piece, segs);
      if (hit >= 0) {
        let lo = prev, hi = s;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) / 2;
          if (this.colliderSegs(piece, piece.segsAt(dir, mid)) >= 0) hi = mid; else lo = mid;
        }
        return { sExit: Infinity, sBlock: lo, blocker: hit };
      }
      if (this.segsOutside(segs)) return { sExit: s, sBlock: Infinity, blocker: -1 };
      prev = s;
    }
    return { sExit: Infinity, sBlock: prev, blocker: -1 };
  }
  /** Progress at which the rope's head point leaves the pool (for drawing corridors). */
  headExitS(piece, dir) {
    for (let s = 0; s < dir.L + Math.hypot(this.w, this.h) + 2; s += 0.05) {
      const h = dir.headAt(s);
      const x = h.x + piece.pos.x, y = h.y + piece.pos.y;
      if (x < -0.15 || x > this.w + 0.15 || y < -0.15 || y > this.h + 0.15) return s;
    }
    return 0;
  }
  clearDirs(piece) {
    const out = [];
    for (const d of piece.dirs) {
      const r = this.sweep(piece, d);
      if (r.sBlock === Infinity && r.sExit < Infinity) out.push({ dir: d, sExit: r.sExit });
    }
    return out;
  }
  /** Can this piece be removed right now (by pulling or popping)? */
  removable(piece) {
    if (this.isFree(piece)) return { pop: true };
    const dirs = this.clearDirs(piece);
    return dirs.length ? { pull: dirs } : null;
  }
  /**
   * Greedy solver. Removal only ever frees space, so a puzzle is solvable iff the greedy process
   * clears the board. A direction blocked by piece B stays blocked until B leaves, so blockers are
   * cached instead of re-swept every step.
   */
  solve() {
    const removedBefore = this.pieces.map((p) => p.removed);
    const n = this.pieces.length;
    const order = [], movableCounts = [];
    const ready = new Set();
    const blockedBy = this.pieces.map((p) => p.dirs.map(() => -2));
    let pops = 0;
    const check = (i) => {
      const p = this.pieces[i];
      if (this.isFree(p)) return true;
      for (let d = 0; d < p.dirs.length; d++) {
        const b = blockedBy[i][d];
        if (b >= 0 && !this.pieces[b].removed) continue;
        const r = this.sweep(p, p.dirs[d]);
        if (r.sBlock === Infinity && r.sExit < Infinity) return true;
        blockedBy[i][d] = r.blocker >= 0 ? r.blocker : -3;
      }
      return false;
    };
    while (this.remaining > 0) {
      for (let i = 0; i < n; i++) {
        if (this.pieces[i].removed || ready.has(i)) continue;
        if (check(i)) ready.add(i);
      }
      if (!ready.size) break;
      movableCounts.push(ready.size);
      let pick = -1;
      for (const i of ready) { if (!this.isFree(this.pieces[i])) { pick = i; break; } }
      if (pick < 0) { pick = ready.values().next().value; pops++; }
      ready.delete(pick);
      order.push(pick);
      this.pieces[pick].removed = true;
    }
    const solved = this.remaining === 0;
    this.pieces.forEach((p, i) => { p.removed = removedBefore[i]; });
    let num = 0, den = 0;
    movableCounts.forEach((c, k) => { const wgt = (n - k) / n; num += wgt / c; den += wgt; });
    return { solved, order, movableCounts, hardness: den ? num / den : 0, pops, firstMoves: movableCounts[0] || 0 };
  }
}

export { STROKE_R, glyph, polyLength };
