// Pre-generates deterministic levels into web/levels.json so the phone never waits on the solver.
import { writeFileSync } from 'node:fs';
import { generateLevel } from '../web/js/generator.js';
import { boardToData } from '../web/js/levels.js';

const COUNT = Number(process.argv[2] || 150);
const levels = [];
const t0 = Date.now();
for (let n = 1; n <= COUNT; n++) {
  const { word, board, stats } = generateLevel(n);
  levels.push(boardToData(n, word, board, stats));
  if (n % 25 === 0) console.log(`  ${n}/${COUNT} (${Date.now() - t0}ms)`);
}
writeFileSync(new URL('../web/levels.json', import.meta.url), JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), levels }));
console.log(`wrote ${levels.length} levels in ${Date.now() - t0}ms`);
