// Level loading: pre-generated levels.json first, procedural generation as the fallback.
import { Board, Piece } from './engine.js';
import { generateLevel } from './generator.js';

let shipped = null;

export async function loadShippedLevels(url = 'levels.json') {
  if (shipped) return shipped;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    shipped = new Map(data.levels.map((l) => [l.level, l]));
  } catch {
    shipped = new Map();
  }
  return shipped;
}

export function boardFromData(l) {
  const board = new Board(l.w, l.h);
  board.pieces = l.pieces.map((p) => new Piece(p.ch, { x: p.x, y: p.y }, p.color));
  return board;
}

export function boardToData(level, word, board, stats) {
  return {
    level, word, w: board.w, h: board.h,
    pieces: board.pieces.map((p) => ({ ch: p.ch, x: +p.pos.x.toFixed(3), y: +p.pos.y.toFixed(3), color: p.color })),
    hardness: +stats.hardness.toFixed(2), firstMoves: stats.firstMoves,
  };
}

/** Returns { level, word, board } synchronously (uses shipped data when present). */
export function getLevel(n) {
  const l = shipped && shipped.get(n);
  if (l) return { level: n, word: l.word, board: boardFromData(l), shipped: true };
  const gen = generateLevel(n);
  return { level: n, word: gen.word, board: gen.board, shipped: false };
}
