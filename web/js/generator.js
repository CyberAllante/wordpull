// Procedural level generator: word -> packed, solvable pool. Deterministic per level number.
import { Board, Piece, CLEARANCE, TOUCH, piecesWithin } from './engine.js';
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
  for (const p of order) {
    const placed = board.pieces;
    let best = null, bestScore = -Infinity, found = 0;
    const cx = placed.length ? placed.reduce((s, q) => s + q.center.x, 0) / placed.length : w / 2;
    const cy = placed.length ? placed.reduce((s, q) => s + q.center.y, 0) / placed.length : h / 2;
    const tries = placed.length ? 80 : 8;
    for (let t = 0; t < tries && found < 8; t++) {
      const spread = placed.length ? 0.5 + (t / tries) * Math.max(w, h) * 0.9 : 0.5;
      let x = cx - p.g.w / 2 + r.range(-spread, spread);
      let y = cy - p.g.h / 2 + r.range(-spread, spread);
      x = Math.min(Math.max(x, margin), w - p.g.w - margin);
      y = Math.min(Math.max(y, margin), h - p.g.h - margin);
      p.pos = { x, y };
      if (board.collider(p, null, CLEARANCE) >= 0) continue;
      let touching = 0;
      for (const q of placed) if (piecesTouch(p, q)) touching++;
      // a closed letter must be free when its turn comes: nothing placed before it may touch it
      if (p.closed && touching) continue;
      // tight puzzles: once letters exist, only accept spots that lock onto something
      if (placed.length && !p.closed && !touching && t < tries * 0.7) continue;
      let clearDirs = 0;
      if (!p.closed) {
        for (const d of p.dirs) {
          const sw = board.sweep(p, d);
          if (sw.sBlock === Infinity && sw.sExit < Infinity) clearDirs++;
        }
        if (!clearDirs) continue;
      }
      found++;
      const dc = Math.hypot(p.center.x - cx, p.center.y - cy);
      const score = touching * 3 - dc + (clearDirs === 1 ? 1.2 : 0) - (p.closed ? dc : 0) + r() * 0.4;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (!best) return null;
    p.pos = best;
    board.pieces.push(p);
    solution.push(p);
  }
  board.pieces = pieces; // keep word order for display
  board.solution = solution.reverse().map((p) => pieces.indexOf(p));
  return board;
}

function piecesTouch(a, b) {
  return piecesWithin(a, null, b, TOUCH);
}

/**
 * Generate a level. Returns { level, word, board, stats } or throws if nothing solvable was found.
 */
export function generateLevel(level, opts = {}) {
  const spec = { ...levelSpec(level), ...opts };
  const r = rng(0x5EED + level * 1013);
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
