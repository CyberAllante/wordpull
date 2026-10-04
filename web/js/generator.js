// Procedural level generator: word -> packed, solvable pool. Deterministic per level number.
import { Board, Piece, CLEARANCE, TOUCH, STROKE_R, piecesWithin } from './engine.js';
import { segSegDist2 } from './geom.js';
import { WORDS } from './words.js';

/** Small seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[next.int(arr.length)];
  next.range = (lo, hi) => lo + next() * (hi - lo);
  return next;
}

export const PALETTE = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#63e6e2',
  '#ff8787', '#ffc078', '#a9e34b', '#3bc9db', '#9775fa', '#e599f7', '#ff922b', '#51cf66',
];

/** Difficulty curve: what a level asks for. */
export function levelSpec(level) {
  const n = level;
  let length;
  if (n <= 4) length = 3;
  else if (n <= 12) length = 4;
  else if (n <= 24) length = 5;
  else if (n <= 40) length = 6;
  else if (n <= 60) length = 7;
  else if (n <= 85) length = 8;
  else length = 9;
  // case mode: capitals first, then title case, lowercase and mixed
  let caseMode = 'upper';
  if (n >= 8) {
    const cycle = n % 5;
    caseMode = cycle === 0 ? 'lower' : cycle === 2 ? 'title' : cycle === 4 && n >= 20 ? 'mixed' : 'upper';
  }
  // density grows (letters packed tighter) and the generator prefers harder packings as you go
  const density = Math.max(1.75, 2.25 - n * 0.008);
  const targetHardness = Math.min(0.95, 0.35 + n * 0.012);
  const attempts = n < 5 ? 6 : 14;
  return { length, caseMode, density, targetHardness, attempts };
}

export function pickWord(level, r) {
  const spec = levelSpec(level);
  const list = WORDS[spec.length];
  const word = list[(level * 7919 + r.int(list.length)) % list.length];
  return applyCase(word, spec.caseMode, r);
}

export function applyCase(word, mode, r) {
  switch (mode) {
    case 'lower': return word.toLowerCase();
    case 'title': return word[0] + word.slice(1).toLowerCase();
    case 'mixed': return word.split('').map((c) => (r() < 0.5 ? c : c.toLowerCase())).join('');
    default: return word;
  }
}

function poolSize(pieces, density) {
  let area = 0, maxW = 0, maxH = 0;
  for (const p of pieces) { area += p.g.w * p.g.h; maxW = Math.max(maxW, p.g.w); maxH = Math.max(maxH, p.g.h); }
  const target = area * density;
  const aspect = 0.78; // w / h, portrait-ish pool
  let w = Math.sqrt(target * aspect), h = w / aspect;
  w = Math.max(w, maxW + 0.6); h = Math.max(h, maxH + 0.6);
  return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 };
}

/**
 * Reverse-construction packing.
 * Letters are inserted in the reverse of a removal order: each new letter is dropped only where it
 * has a clear pull path given the letters already present. Because removing a letter never blocks
 * anything, that insertion order (reversed) is a guaranteed solution. Closed letters (O, o) go in
 * first, never touching each other, so they are free to pop once everything around them is gone.
 */
export function pack(word, density, r) {
  const colors = PALETTE.slice();
  for (let i = colors.length - 1; i > 0; i--) { const j = r.int(i + 1); [colors[i], colors[j]] = [colors[j], colors[i]]; }
  const pieces = word.split('').map((ch, i) => new Piece(ch, { x: 0, y: 0 }, colors[i % colors.length]));
  const { w, h } = poolSize(pieces, density);
  const board = new Board(w, h);
  const margin = 0.1;
  const order = pieces.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  order.sort((a, b) => (b.closed ? 1 : 0) - (a.closed ? 1 : 0));
  const solution = [];
  // For every placed letter, the exit corridors (open ends) that are still clear. A later letter
  // that sits in one of those corridors creates a dependency: it must leave first.
  const corridors = new Map(); // piece -> [{ a, b }] world segments of clear corridors
  const corridorOf = (p, dir) => {
    const a = { x: p.pos.x + dir.headPt0.x, y: p.pos.y + dir.headPt0.y };
    const t = dir.exitTan;
    // run the ray until it leaves the pool
    let d = 0;
    while (d < 20) { const x = a.x + t.x * d, y = a.y + t.y * d; if (x < 0 || x > w || y < 0 || y > h) break; d += 0.05; }
    return { a, b: { x: a.x + t.x * d, y: a.y + t.y * d } };
  };
  const segsHitCorridor = (segs, cor) => {
    const lim = (2 * STROKE_R + 0.02) ** 2;
    for (const [p1, p2] of segs) if (segSegDist2(p1, p2, cor.a, cor.b) < lim) return true;
    return false;
  };
  for (const p of order) {
    const placed = board.pieces;
    let best = null, bestScore = -Infinity, found = 0;
    const cx = placed.length ? placed.reduce((s, q) => s + q.center.x, 0) / placed.length : w / 2;
    const cy = placed.length ? placed.reduce((s, q) => s + q.center.y, 0) / placed.length : h / 2;
    const tries = placed.length ? 90 : 8;
    for (let t = 0; t < tries && found < 10; t++) {
      const spread = placed.length ? 0.5 + (t / tries) * Math.max(w, h) * 0.9 : 0.5;
      let x = cx - p.g.w / 2 + r.range(-spread, spread);
      let y = cy - p.g.h / 2 + r.range(-spread, spread);
      // half the time, aim straight into an earlier letter's clear corridor to build a dependency chain
      const withCors = [...corridors.entries()].filter(([, cs]) => cs.length);
      if (withCors.length && r() < 0.55) {
        const [, cs] = r.pick(withCors);
        const cor = r.pick(cs);
        const cl = Math.hypot(cor.b.x - cor.a.x, cor.b.y - cor.a.y);
        const d = r.range(0.25, Math.max(0.3, cl - 0.1));
        const ux = (cor.b.x - cor.a.x) / (cl || 1), uy = (cor.b.y - cor.a.y) / (cl || 1);
        x = cor.a.x + ux * d - p.g.w / 2 + r.range(-0.25, 0.25);
        y = cor.a.y + uy * d - p.g.h / 2 + r.range(-0.25, 0.25);
      }
      x = Math.min(Math.max(x, margin), w - p.g.w - margin);
      y = Math.min(Math.max(y, margin), h - p.g.h - margin);
      p.pos = { x, y };
      if (board.collider(p, CLEARANCE) >= 0) continue;
      let touching = 0;
      for (const q of placed) if (piecesTouch(p, q)) touching++;
      if (p.closed && touching) continue;
      if (placed.length && !p.closed && !touching && t < tries * 0.7) continue;
      let clear = [];
      if (!p.closed) {
        for (const d of p.dirs) {
          const sw = board.sweep(p, d);
          if (sw.sBlock === Infinity && sw.sExit < Infinity) clear.push(d);
        }
        if (!clear.length) continue;
      }
      // how many earlier letters does this spot lock in (all their clear corridors blocked)?
      const segs = p.restSegs();
      let locks = 0, blocked = 0;
      for (const [q, cors] of corridors) {
        if (!cors.length) continue;
        const left = cors.filter((c) => !segsHitCorridor(segs, c)).length;
        blocked += cors.length - left;
        if (left === 0) locks++;
      }
      found++;
      const dc = Math.hypot(p.center.x - cx, p.center.y - cy);
      const score = touching * 2 + locks * 4 + blocked * 1.5 - dc + (clear.length === 1 ? 1 : 0) - (p.closed ? dc : 0) + r() * 0.4;
      if (score > bestScore) { bestScore = score; best = { x, y, clear }; }
    }
    if (!best) return null;
    p.pos = { x: best.x, y: best.y };
    // update corridors of earlier letters, then register this letter's own
    const segs = p.restSegs();
    for (const [q, cors] of corridors) corridors.set(q, cors.filter((c) => !segsHitCorridor(segs, c)));
    corridors.set(p, best.clear.map((d) => corridorOf(p, d)));
    board.pieces.push(p);
    solution.push(p);
  }
  board.pieces = pieces; // keep word order for display
  board.solution = solution.reverse().map((p) => pieces.indexOf(p));
  return board;
}

function piecesTouch(a, b) {
  return piecesWithin(a, b, TOUCH);
}

/**
 * Generate a level. Returns { level, word, board, stats } or throws if nothing solvable was found.
 */
export function generateLevel(level, opts = {}) {
  const spec = { ...levelSpec(level), ...opts };
  const r = rng(opts.seed != null ? opts.seed : 0x5EED + level * 1013);
  const word = opts.word || pickWord(level, r);
  const candidates = [];
  let density = spec.density;
  for (let attempt = 0; attempt < spec.attempts * 4 && candidates.length < spec.attempts; attempt++) {
    const board = pack(word, density, r);
    if (!board) { density += 0.06; continue; }
    const stats = board.solve();
    if (!stats.solved) { density += 0.03; continue; } // should not happen with reverse construction
    // every letter should start locked to at least one neighbour (otherwise it's a free pop)
    const loose = board.pieces.filter((p) => board.isFree(p)).length;
    candidates.push({ board, stats, loose });
    if (loose === 0 && Math.abs(stats.hardness - spec.targetHardness) < 0.08) break;
  }
  if (!candidates.length) throw new Error(`Could not generate level ${level} (${word})`);
  candidates.sort((a, b) => {
    const la = a.loose, lb = b.loose;
    if (la !== lb) return la - lb;
    return Math.abs(a.stats.hardness - spec.targetHardness) - Math.abs(b.stats.hardness - spec.targetHardness);
  });
  const best = candidates[0];
  return { level, word, board: best.board, stats: { ...best.stats, loose: best.loose, spec } };
}

/** Daily challenge: a long mixed-case word chosen from the date seed. */
export function dailyWord(seed) {
  const r = rng(seed);
  const list = WORDS[r() < 0.5 ? 8 : 9];
  return applyCase(list[r.int(list.length)], 'mixed', r);
}
