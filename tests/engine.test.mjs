import test from 'node:test';
import assert from 'node:assert/strict';
import { glyph, SUPPORTED } from '../web/js/glyphs.js';
import { Board, Piece } from '../web/js/engine.js';
import { generateLevel, levelSpec } from '../web/js/generator.js';
import { segSegDist2, polyLength } from '../web/js/geom.js';

test('segment distance basics', () => {
  const d = Math.sqrt(segSegDist2({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }));
  assert.ok(Math.abs(d - 1) < 1e-9);
  const d2 = Math.sqrt(segSegDist2({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }));
  assert.ok(d2 < 1e-9, 'crossing segments have zero distance');
  const d3 = Math.sqrt(segSegDist2({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 }));
  assert.ok(Math.abs(d3 - 5) < 1e-9, 'degenerate segments behave like points');
  // a point against a segment, in both argument orders (regression: the dot of an "i")
  const pt = { x: 5, y: 1 }, a1 = { x: 0, y: 0 }, a2 = { x: 10, y: 0 };
  assert.ok(Math.abs(Math.sqrt(segSegDist2(pt, pt, a1, a2)) - 1) < 1e-9);
  assert.ok(Math.abs(Math.sqrt(segSegDist2(a1, a2, pt, pt)) - 1) < 1e-9);
  const sym = Math.abs(segSegDist2({ x: 1.671, y: 1.555 }, { x: 1.671, y: 1.555 }, { x: 1.26, y: 2.12 }, { x: 1.46, y: 1.52 }) - segSegDist2({ x: 1.26, y: 2.12 }, { x: 1.46, y: 1.52 }, { x: 1.671, y: 1.555 }, { x: 1.671, y: 1.555 }));
  assert.ok(sym < 1e-12, 'segment distance is symmetric');
});

test('every glyph is one continuous rope with sane ends', () => {
  for (const ch of SUPPORTED) {
    const g = glyph(ch);
    assert.ok(g.w > 0.1 && g.h > 0.5, `${ch} has a sane box`);
    assert.ok(g.L > 0.5, `${ch} path long enough`);
    for (let i = 1; i < g.path.length; i++) {
      const d = Math.hypot(g.path[i].x - g.path[i - 1].x, g.path[i].y - g.path[i - 1].y);
      assert.ok(d < 1.3, `${ch} path jumps ${d.toFixed(2)} at ${i}`);
    }
    if ('Oo'.includes(ch)) assert.ok(!g.openStart && !g.openEnd, `${ch} is closed`);
    else assert.ok(g.openStart || g.openEnd, `${ch} has an open end`);
  }
});

test('a rope slides out of its own shape and exits an empty pool', () => {
  const b = new Board(4, 4);
  const p = new Piece('S', { x: 1.5, y: 1.5 }, '#fff');
  b.pieces.push(p);
  assert.equal(p.dirs.length, 2);
  for (const d of p.dirs) {
    const r = b.sweep(p, d);
    assert.equal(r.sBlock, Infinity);
    assert.ok(r.sExit < Infinity && r.sExit > 1);
    // at rest the body is the glyph path; half way it is still the same length
    const b0 = d.bodyAt(0), b1 = d.bodyAt(0.7);
    assert.ok(Math.abs(polyLength(b0.pts) - p.g.L) < 1e-6);
    assert.ok(Math.abs(polyLength(b1.pts) - p.g.L) < 1e-6);
    // the head moves along the exit tangent once past the groove
    const h1 = d.headAt(p.g.L + 0.5), h2 = d.headAt(p.g.L + 1.0);
    const t = { x: h2.x - h1.x, y: h2.y - h1.y };
    assert.ok(Math.abs(t.x / 0.5 - d.exitTan.x) < 1e-6 && Math.abs(t.y / 0.5 - d.exitTan.y) < 1e-6);
  }
  const pOnly = new Piece('P', { x: 0, y: 0 }, '#fff');
  assert.equal(pOnly.dirs.length, 1, 'P pulls only from its stem end');
  assert.equal(new Piece('O', { x: 0, y: 0 }, '#fff').dirs.length, 0);
});

test('a letter in the way blocks the pull and is reported', () => {
  const b = new Board(6, 6);
  const I = new Piece('I', { x: 2, y: 1 }, '#fff');
  const T = new Piece('T', { x: 1.6, y: 2.4 }, '#fff');
  b.pieces.push(I, T);
  const down = I.dirs.find((d) => d.exitTan.y > 0.9);
  const r = b.sweep(I, down);
  assert.equal(r.blocker, 1, 'the T blocks the downward pull');
  assert.ok(r.sBlock < 0.6);
  const up = I.dirs.find((d) => d.exitTan.y < -0.9);
  assert.equal(b.sweep(I, up).sBlock, Infinity, 'upward is clear');
  assert.ok(b.removable(I).pull.length === 1);
  assert.ok(b.solve().solved);
});

test('closed letters can only be popped once free', () => {
  const b = new Board(6, 6);
  const O = new Piece('O', { x: 1, y: 1 }, '#fff');
  const I = new Piece('I', { x: 1.9, y: 1 }, '#fff'); // snug against the O's right side
  b.pieces.push(O, I);
  assert.equal(b.removable(O), null, 'O is locked by the I');
  I.removed = true;
  assert.deepEqual(b.removable(O), { pop: true });
});

test('levels 1-40 generate, are solvable and deterministic', { timeout: 300000 }, () => {
  const t0 = Date.now();
  const seen = new Set();
  for (let lvl = 1; lvl <= 40; lvl++) {
    const { word, board, stats } = generateLevel(lvl);
    seen.add(word);
    assert.ok(stats.solved, `level ${lvl} (${word}) solvable`);
    assert.equal(board.pieces.length, word.length);
    assert.equal(word.length, levelSpec(lvl).length);
    for (const p of board.pieces) assert.ok(board.insidePool(p), `${word}: ${p.ch} starts inside the pool`);
    for (const p of board.pieces) assert.equal(board.collider(p, 0), -1, `${word}: ${p.ch} overlaps nothing`);
    // deterministic
    const again = generateLevel(lvl);
    assert.equal(again.word, word);
    assert.deepEqual(again.board.pieces.map((p) => p.pos), board.pieces.map((p) => p.pos));
  }
  const ms = Date.now() - t0;
  console.log(`generated 40 levels twice in ${ms}ms, ${seen.size} distinct words`);
});
