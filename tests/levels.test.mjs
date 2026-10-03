import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardFromData } from '../web/js/levels.js';

test('every shipped level is overlap-free, inside the pool and solvable', { timeout: 600000 }, () => {
  const data = JSON.parse(readFileSync(new URL('../web/levels.json', import.meta.url), 'utf8'));
  assert.ok(data.levels.length >= 200);
  let loose = 0;
  for (const l of data.levels) {
    const board = boardFromData(l);
    assert.equal(board.pieces.map((p) => p.ch).join(''), l.word);
    for (const p of board.pieces) {
      assert.ok(board.insidePool(p), `level ${l.level} ${l.word}: ${p.ch} outside pool`);
      assert.equal(board.collider(p, null, 0), -1, `level ${l.level} ${l.word}: ${p.ch} overlaps`);
      if (board.isFree(p)) loose++;
    }
    const stats = board.solve();
    assert.ok(stats.solved, `level ${l.level} ${l.word} not solvable`);
  }
  console.log(`validated ${data.levels.length} levels, ${loose} letters start loose`);
});
