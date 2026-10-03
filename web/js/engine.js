// Word Pool core engine: pieces, pull directions, collision, exits and the solver.
import { segSegDist2, polyAt, polyLength, sub, add, mul, norm } from './geom.js';
import { glyph, STROKE_R } from './glyphs.js';

export const CLEARANCE = 0.05;   // min gap between stroke surfaces when placing letters
export const TOUCH = 0.22;        // surfaces closer than this are "touching" (letter is locked)
export const STEP = 0.025;        // path sampling step for collision sweeps (letter units)

/** A letter sitting in the pool. */
export class Piece {
  constructor(ch, pos, color) {
    this.ch = ch;
    this.g = glyph(ch);
    this.pos = { x: pos.x, y: pos.y }; // translation of the glyph box origin, in pool units
    this.color = color;
    this.removed = false;
    this.dirs = buildDirs(this.g);
  }
  get center() { return add(this.pos, this.g.center); }
  get closed() { return this.dirs.length === 0; }
  /** World-space segments with an optional extra displacement. */
  segsAt(off) {
    const dx = this.pos.x + (off ? off.x : 0), dy = this.pos.y + (off ? off.y : 0);
    return this.g.segs.map(([a, b]) => [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }]);
  }
  /** Cached world-space segments at rest (recomputed when the piece moves). */
  restSegs() {
    if (!this._rest || this._rest.x !== this.pos.x || this._rest.y !== this.pos.y) {
      this._rest = { x: this.pos.x, y: this.pos.y, segs: this.segsAt(null) };
    }
    return this._rest.segs;
  }
  bboxAt(off) {
    const dx = this.pos.x + (off ? off.x : 0), dy = this.pos.y + (off ? off.y : 0);
    return { minX: dx, minY: dy, maxX: dx + this.g.w, maxY: dy + this.g.h };
  }
}

/**
 * A pull direction: the letter "draws itself" along one of its tracks, starting from one end.
 * disp(s) = displacement after travelling arc length s; beyond the track it continues straight.
 */
function buildDirs(g) {
  const dirs = [];
  g.tracks.forEach((track, ti) => {
    const fwd = track, rev = track.slice().reverse();
    for (const [poly, end] of [[fwd, 0], [rev, 1]]) {
      const L = polyLength(poly);
      if (L < 1e-6) continue;
      const endTan = polyAt(poly, L).tan;
      const startTan = polyAt(poly, 0.001).tan;
      dirs.push({
        track: ti, end, poly, L, startTan, endTan,
        startPt: poly[0],
        disp(s) {
          if (s <= L) return sub(polyAt(poly, s).pt, poly[0]);
          return add(sub(poly[poly.length - 1], poly[0]), mul(endTan, s - L));
        },
        tan(s) { return s < L ? polyAt(poly, Math.max(s, 0.001)).tan : endTan; },
      });
    }
  });
  return dirs;
}

/** Does piece `a` displaced by `offA` come within `gap` of resting piece `b`? */
export function piecesWithin(a, offA, b, gap, movSegs) {
  const ox = offA ? offA.x : 0, oy = offA ? offA.y : 0;
  const dx = a.pos.x + a.g.center.x + ox - (b.pos.x + b.g.center.x);
  const dy = a.pos.y + a.g.center.y + oy - (b.pos.y + b.g.center.y);
  const reach = a.g.radius + b.g.radius + 2 * STROKE_R + gap;
  if (dx * dx + dy * dy > reach * reach) return false;
  const sa = movSegs || a.segsAt(offA), sb = b.restSegs();
  const lim = (2 * STROKE_R + gap) ** 2;
  for (let i = 0; i < sa.length; i++) {
    const p1 = sa[i][0], p2 = sa[i][1];
    for (let j = 0; j < sb.length; j++) {
      if (segSegDist2(p1, p2, sb[j][0], sb[j][1]) < lim) return true;
    }
  }
  return false;
}

export class Board {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.pieces = [];
  }
  get active() { return this.pieces.filter((p) => !p.removed); }
  get remaining() { return this.pieces.reduce((n, p) => n + (p.removed ? 0 : 1), 0); }

  insidePool(piece, off) {
    const b = piece.bboxAt(off);
    return b.minX >= 0 && b.minY >= 0 && b.maxX <= this.w && b.maxY <= this.h;
  }
  outsidePool(piece, off) {
    const b = piece.bboxAt(off);
    return b.maxX <= 0 || b.minX >= this.w || b.maxY <= 0 || b.minY >= this.h;
  }
  /** Index of the first active piece colliding with `piece` displaced by `off`, or -1. */
  collider(piece, off, gap = 0) {
    let movSegs = null;
    for (let i = 0; i < this.pieces.length; i++) {
      const o = this.pieces[i];
      if (o === piece || o.removed) continue;
      if (!movSegs) movSegs = piece.segsAt(off);
      if (piecesWithin(piece, off, o, gap, movSegs)) return i;
    }
    return -1;
  }
  /** Is the piece touching nothing? (then it can be popped straight out) */
  isFree(piece) {
    return this.collider(piece, null, TOUCH) < 0;
  }
  /**
   * Sweep a piece along a pull direction.
   * Returns { sExit, sBlock, blocker } where sBlock = Infinity if the path is clear to the exit.
   */
  sweep(piece, dir) {
    const maxS = dir.L + Math.hypot(this.w, this.h) + 2;
    let prev = 0;
    for (let s = STEP; s <= maxS; s += STEP) {
      const off = dir.disp(s);
      const hit = this.collider(piece, off);
      if (hit >= 0) {
        // refine between prev (clear) and s (blocked)
        let lo = prev, hi = s;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) / 2;
          if (this.collider(piece, dir.disp(mid)) >= 0) hi = mid; else lo = mid;
        }
        return { sExit: Infinity, sBlock: lo, blocker: hit };
      }
      if (this.outsidePool(piece, off)) return { sExit: s, sBlock: Infinity, blocker: -1 };
      prev = s;
    }
    return { sExit: Infinity, sBlock: prev, blocker: -1 };
  }
  /** All clear pull directions for a piece. */
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
   * Greedy solver. Removal only ever frees space, so a puzzle is solvable iff the greedy
   * process clears the board. A direction blocked by piece B stays blocked until B leaves,
   * which lets us cache blockers instead of re-sweeping every step.
   * Returns { solved, order, movableCounts, hardness, pops, firstMoves }.
   */
  solve() {
    const removedBefore = this.pieces.map((p) => p.removed);
    const n = this.pieces.length;
    const order = [], movableCounts = [];
    const ready = new Set();                 // indices known to be removable
    const blockedBy = this.pieces.map((p) => p.dirs.map(() => -2)); // -2 unknown, >=0 blocker idx
    let pops = 0;
    const check = (i) => {
      const p = this.pieces[i];
      if (this.isFree(p)) return true;
      for (let d = 0; d < p.dirs.length; d++) {
        const b = blockedBy[i][d];
        if (b >= 0 && !this.pieces[b].removed) continue; // still blocked by the same piece
        const r = this.sweep(p, p.dirs[d]);
        if (r.sBlock === Infinity && r.sExit < Infinity) return true;
        blockedBy[i][d] = r.blocker >= 0 ? r.blocker : -1;
        if (r.blocker < 0 && r.sBlock !== Infinity) blockedBy[i][d] = -3; // never exits (should not happen)
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
      // prefer a pull over a pop so the recorded order reads like a real solution
      let pick = -1;
      for (const i of ready) { if (!this.isFree(this.pieces[i])) { pick = i; break; } }
      if (pick < 0) { pick = ready.values().next().value; pops++; }
      ready.delete(pick);
      order.push(pick);
      this.pieces[pick].removed = true;
    }
    const solved = this.remaining === 0;
    this.pieces.forEach((p, i) => { p.removed = removedBefore[i]; });
    // hardness: 1 when every step has exactly one option, lower when the player has many choices.
    // Early steps weigh more than the end game.
    let num = 0, den = 0;
    movableCounts.forEach((c, k) => { const wgt = (n - k) / n; num += wgt / c; den += wgt; });
    const hardness = den ? num / den : 0;
    return { solved, order, movableCounts, hardness, pops, firstMoves: movableCounts[0] || 0 };
  }
}

export { STROKE_R, glyph, norm };
