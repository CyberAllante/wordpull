// Browser end-to-end test: boots the game in headless Chromium at iPhone size, claims the daily
// gift, plays level 1 by dragging real letters along their pull paths, checks coins and the win
// screen, then exercises bumps / out-of-moves, the Pop booster, the shop and chapters.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 8123;
const server = spawn('npx', ['http-server', 'web', '-p', String(PORT), '-c-1', '-s'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('tests/out', { recursive: true });
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function dragPath(page, pts) {
  const [p0, ...rest] = pts;
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  for (const q of rest) { await page.mouse.move(q.x, q.y); await wait(8); }
  await page.mouse.up();
}
// Build the pointer path (CSS px) that pulls `piece` along `dir` for `sEnd` units.
const pathFor = `(p, dir, sEnd) => {
  const rect = window.__wp.rect;
  const toPx = (u) => ({ x: rect.x + u.x * rect.scale, y: rect.y + u.y * rect.scale });
  const grab = { x: p.pos.x + dir.startPt.x + dir.startTan.x * 0.12, y: p.pos.y + dir.startPt.y + dir.startTan.y * 0.12 };
  const n = Math.max(12, Math.ceil(sEnd / 0.04)), pts = [];
  for (let i = 0; i <= n; i++) { const o = dir.disp((sEnd * i) / n); pts.push(toPx({ x: grab.x + o.x, y: grab.y + o.y })); }
  return pts;
}`;

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
  await wait(500);

  // first launch: daily gift modal
  await page.waitForSelector('#btn-claim-daily', { timeout: 5000 });
  await page.screenshot({ path: 'tests/out/01-daily-gift.png' });
  const coins0 = await page.evaluate(() => __wp.save.coins);
  await page.click('#btn-claim-daily');
  await wait(1300);
  const coins1 = await page.evaluate(() => __wp.save.coins);
  expect(coins1 === coins0 + 25, `daily gift not credited: ${coins0} -> ${coins1}`);
  expect(await page.evaluate(() => __wp.save.daily.streak) === 1, 'daily streak not recorded');
  await page.screenshot({ path: 'tests/out/02-home.png' });

  // play level 1
  await page.click('#btn-play');
  await page.waitForFunction(() => window.__wp.screen === 'play');
  await wait(300);
  await page.screenshot({ path: 'tests/out/03-level1.png' });
  const info = await page.evaluate(() => ({ level: __wp.level, word: __wp.word, n: __wp.board.pieces.length, hearts: __wp.bumpsLeft }));
  console.log('playing level', info.level, info.word, 'hearts', info.hearts);
  for (let step = 0; step < info.n; step++) {
    const move = await page.evaluate((pathSrc) => {
      const pathFor = eval(pathSrc);
      const b = window.__wp.board, rect = window.__wp.rect;
      for (const p of b.active) {
        const r = b.removable(p);
        if (!r) continue;
        if (r.pop) { const c = p.center; return { ch: p.ch, pop: true, at: { x: rect.x + c.x * rect.scale, y: rect.y + c.y * rect.scale } }; }
        return { ch: p.ch, pop: false, pts: pathFor(p, r.pull[0].dir, r.pull[0].sExit), sExit: r.pull[0].sExit };
      }
      return null;
    }, pathFor);
    expect(move, 'no removable letter at step ' + step);
    if (move.pop) { await page.touchscreen.tap(move.at.x, move.at.y); console.log(`  tap-pop ${move.ch}`); }
    else { await dragPath(page, move.pts); console.log(`  pulled ${move.ch} (${move.sExit.toFixed(2)} units)`); }
    await page.waitForFunction((k) => window.__wp.board.pieces.filter((p) => p.removed).length >= k, step + 1, { timeout: 5000 });
    await wait(450);
  }
  await page.waitForFunction(() => window.__wp.screen === 'win', null, { timeout: 5000 });
  await wait(1600);
  await page.screenshot({ path: 'tests/out/04-win.png' });
  const after = await page.evaluate(() => ({ coins: __wp.save.coins, unlocked: __wp.save.unlocked, stars: __wp.save.stars[1], crowns: Object.keys(__wp.save.crowns).length, saved: JSON.parse(localStorage.getItem('wordpool.v1')).unlocked }));
  console.log('after level 1:', JSON.stringify(after));
  expect(after.unlocked === 2 && after.saved === 2, 'progress not saved');
  expect(after.coins > coins1, 'no coins awarded for the clear');
  expect(after.stars === 3 && after.crowns === 1, 'perfect clear should give 3 stars and a crown');

  // level 2: a blocked pull costs a heart and is refused; run hearts out -> out of moves modal
  await page.click('#btn-next');
  await page.waitForFunction(() => window.__wp.level === 2 && window.__wp.screen === 'play');
  await wait(200);
  const blocked = await page.evaluate((pathSrc) => {
    const pathFor = eval(pathSrc);
    const b = window.__wp.board;
    for (const p of b.active) for (const dir of p.dirs) {
      const sw = b.sweep(p, dir);
      if (sw.sBlock < Infinity && sw.sBlock > 0.05) return { ch: p.ch, pts: pathFor(p, dir, sw.sBlock + 1.2), blocker: b.pieces[sw.blocker].ch };
    }
    return null;
  }, pathFor);
  expect(blocked, 'level 2 has no blocked direction to test');
  const hearts0 = await page.evaluate(() => __wp.bumpsLeft);
  await dragPath(page, blocked.pts);
  await wait(300);
  const st = await page.evaluate((ch) => ({ bumps: __wp.bumps, left: __wp.bumpsLeft, removed: __wp.board.pieces.find((p) => p.ch === ch).removed }), blocked.ch);
  console.log(`  blocked pull of ${blocked.ch} by ${blocked.blocker}:`, JSON.stringify(st));
  expect(!st.removed && st.bumps === 1 && st.left === hearts0 - 1, 'bump should cost exactly one heart');
  for (let i = 0; i < hearts0 - 1; i++) { await wait(450); await dragPath(page, blocked.pts); }
  await page.waitForSelector('#btn-continue', { timeout: 4000 });
  await page.screenshot({ path: 'tests/out/05-out-of-moves.png' });
  const coinsBefore = await page.evaluate(() => __wp.save.coins);
  await page.click('#btn-continue');
  await wait(300);
  const cont = await page.evaluate(() => ({ coins: __wp.save.coins, left: __wp.bumpsLeft, paused: __wp.paused }));
  expect(cont.coins === coinsBefore - 50 && cont.left === 3 && !cont.paused, 'continue should cost 50 coins and give 3 hearts: ' + JSON.stringify(cont));

  // Pop booster: arm, tap a locked letter, it is removed
  const popBefore = await page.evaluate(() => __wp.save.boosters.pop);
  await page.click('.booster[data-booster="pop"]');
  await page.waitForSelector('#targeting:not(.hidden)');
  const target = await page.evaluate(() => { const p = __wp.board.active.find((q) => !__wp.board.removable(q)) || __wp.board.active[0]; const r = __wp.rect; const seg = p.g.segs[0][0]; return { ch: p.ch, x: r.x + (p.pos.x + seg.x) * r.scale, y: r.y + (p.pos.y + seg.y) * r.scale }; });
  await page.touchscreen.tap(target.x, target.y);
  await wait(500);
  const popped = await page.evaluate((ch) => ({ removed: __wp.board.pieces.find((p) => p.ch === ch).removed, left: __wp.save.boosters.pop, targeting: __wp.targeting }), target.ch);
  console.log(`  pop booster on ${target.ch}:`, JSON.stringify(popped));
  expect(popped.removed && popped.left === popBefore - 1 && !popped.targeting, 'pop booster should remove the letter and be consumed');
  await page.screenshot({ path: 'tests/out/06-level2-after-pop.png' });

  // Reveal with none left -> buy & use flow
  await page.evaluate(() => { __wp.save.boosters.reveal = 0; __wp.save.coins = 500; __wp.renderBoosterBar(); __wp.updateCurrency(); });
  await page.click('.booster[data-booster="reveal"]');
  await page.waitForSelector('#btn-buy-use');
  await page.click('#btn-buy-use');
  await wait(300);
  const rev = await page.evaluate(() => ({ coins: __wp.save.coins, reveal: !!__wp.reveal, items: __wp.reveal ? __wp.reveal.items.length : 0 }));
  expect(rev.coins === 450 && rev.reveal && rev.items >= 1, 'reveal buy & use failed: ' + JSON.stringify(rev));
  await page.screenshot({ path: 'tests/out/07-reveal.png' });

  // shop + chapters screens
  await page.click('#btn-home');
  await page.click('#btn-shop');
  await page.waitForSelector('#shop-boosters .shop-item');
  const c0 = await page.evaluate(() => __wp.save.coins);
  await page.click('#shop-boosters .shop-item button.buy');
  await wait(200);
  expect(await page.evaluate(() => __wp.save.coins) === c0 - 30, 'shop purchase did not charge 30 coins');
  await page.screenshot({ path: 'tests/out/08-shop.png' });
  await page.click('#btn-shop-back');
  await page.click('#btn-chapters');
  await page.waitForSelector('#chapter-list .lvl');
  await page.screenshot({ path: 'tests/out/09-chapters.png' });
  // chest: mark chapter 1 complete and claim
  await page.evaluate(() => { for (let l = 1; l <= 10; l++) __wp.save.stars[l] = __wp.save.stars[l] || 1; __wp.save.unlocked = 11; __wp.showChapters(); });
  await page.click('#chapter-list .chest.ready');
  await wait(300);
  expect(await page.evaluate(() => !!__wp.save.chests[0]), 'chest not claimed');
  await page.screenshot({ path: 'tests/out/10-chest.png' });

  // theme switch
  await page.evaluate(() => { __wp.closeModal(); __wp.setTheme('neon'); __wp.startLevel(12); });
  await wait(400);
  await page.screenshot({ path: 'tests/out/11-neon-theme.png' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wordpool.v1')).theme) === 'neon', 'theme not persisted');

  if (errors.length) throw new Error('console errors:\n' + errors.join('\n'));
  console.log('E2E OK');
  await browser.close();
}

main().then(() => { server.kill(); process.exit(0); }, (e) => { console.error(e); server.kill(); process.exit(1); });
