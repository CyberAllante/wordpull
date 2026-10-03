// Browser end-to-end test: boots the game in headless Chromium at iPhone size, plays level 1
// by dragging real letters along their pull paths, and checks the win screen appears.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 8123;
const server = spawn('npx', ['http-server', 'web', '-p', String(PORT), '-c-1', '-s'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('tests/out', { recursive: true });

async function main() {
  await wait(1200);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => window.__wp && window.__wp.titleBoard);
  await wait(600);
  await page.screenshot({ path: 'tests/out/01-home.png' });

  await page.click('#btn-play');
  await page.waitForFunction(() => window.__wp.screen === 'play');
  await wait(300);
  await page.screenshot({ path: 'tests/out/02-level1.png' });

  const info = await page.evaluate(() => ({ level: __wp.level, word: __wp.word, n: __wp.board.pieces.length }));
  console.log('playing level', info.level, info.word);

  // Drag letters out one at a time following the solver's order and real pull paths.
  for (let step = 0; step < info.n; step++) {
    const move = await page.evaluate(() => {
      const g = window.__wp, b = g.board, rect = g.rect;
      const toPx = (u) => ({ x: rect.x + u.x * rect.scale, y: rect.y + u.y * rect.scale });
      for (const p of b.active) {
        const r = b.removable(p);
        if (!r) continue;
        const c = p.center;
        if (r.pop) return { ch: p.ch, pop: true, at: toPx(c) };
        const { dir, sExit } = r.pull[0];
        // grab near the start of the track so direction picking is unambiguous
        const grab = { x: p.pos.x + dir.startPt.x + dir.startTan.x * 0.12, y: p.pos.y + dir.startPt.y + dir.startTan.y * 0.12 };
        const pts = [];
        const n = Math.max(12, Math.ceil(sExit / 0.04));
        for (let i = 0; i <= n; i++) { const o = dir.disp((sExit * i) / n); pts.push(toPx({ x: grab.x + o.x, y: grab.y + o.y })); }
        return { ch: p.ch, pop: false, pts, sExit };
      }
      return null;
    });
    if (!move) throw new Error('no removable letter found at step ' + step);
    if (move.pop) {
      await page.touchscreen.tap(move.at.x, move.at.y);
      console.log(`  tap-pop ${move.ch}`);
    } else {
      const [p0, ...rest] = move.pts;
      await page.mouse.move(p0.x, p0.y);
      await page.mouse.down();
      for (const q of rest) { await page.mouse.move(q.x, q.y); await wait(8); }
      await page.mouse.up();
      console.log(`  pulled ${move.ch} (${move.sExit.toFixed(2)} units)`);
    }
    if (step === 0) { await wait(80); await page.screenshot({ path: 'tests/out/03-after-first-pull.png' }); }
    await page.waitForFunction((k) => window.__wp.board.pieces.filter((p) => p.removed).length >= k, step + 1, { timeout: 5000 });
    await wait(450);
  }
  await page.waitForFunction(() => window.__wp.screen === 'win', null, { timeout: 5000 });
  await wait(400);
  await page.screenshot({ path: 'tests/out/04-win.png' });
  const unlocked = await page.evaluate(() => JSON.parse(localStorage.getItem('wordpool.v1')).unlocked);
  if (unlocked !== 2) throw new Error('progress not saved, unlocked=' + unlocked);

  // Verify a blocked pull does NOT remove the letter and shows a bump.
  await page.click('#btn-next');
  await page.waitForFunction(() => window.__wp.level === 2 && window.__wp.screen === 'play');
  await wait(200);
  const blocked = await page.evaluate(() => {
    const g = window.__wp, b = g.board, rect = g.rect;
    const toPx = (u) => ({ x: rect.x + u.x * rect.scale, y: rect.y + u.y * rect.scale });
    for (const p of b.active) for (const dir of p.dirs) {
      const sw = b.sweep(p, dir);
      if (sw.sBlock < Infinity && sw.sBlock > 0.05) {
        const grab = { x: p.pos.x + dir.startPt.x + dir.startTan.x * 0.12, y: p.pos.y + dir.startPt.y + dir.startTan.y * 0.12 };
        const pts = [];
        const far = sw.sBlock + 1.5;
        for (let i = 0; i <= 30; i++) { const o = dir.disp((far * i) / 30); pts.push(toPx({ x: grab.x + o.x, y: grab.y + o.y })); }
        return { ch: p.ch, pts, blocker: b.pieces[sw.blocker].ch };
      }
    }
    return null;
  });
  if (blocked) {
    const [p0, ...rest] = blocked.pts;
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    for (const q of rest) { await page.mouse.move(q.x, q.y); await wait(8); }
    await page.screenshot({ path: 'tests/out/05-blocked.png' });
    await page.mouse.up();
    const state = await page.evaluate((ch) => ({ bumps: __wp.bumps, removed: __wp.board.pieces.find((p) => p.ch === ch).removed }), blocked.ch);
    console.log(`  blocked pull of ${blocked.ch} by ${blocked.blocker}: bumps=${state.bumps} removed=${state.removed}`);
    if (state.removed) throw new Error('blocked letter was removed');
    if (state.bumps < 1) throw new Error('no bump registered');
  }
  await wait(400);
  await page.screenshot({ path: 'tests/out/06-level2.png' });

  // Levels screen renders
  await page.click('#btn-home');
  await page.click('#btn-levels');
  await page.waitForSelector('#level-grid .lvl');
  await page.screenshot({ path: 'tests/out/07-levels.png' });

  if (errors.length) throw new Error('console errors:\n' + errors.join('\n'));
  console.log('E2E OK');
  await browser.close();
}

main().then(() => { server.kill(); process.exit(0); }, (e) => { console.error(e); server.kill(); process.exit(1); });
