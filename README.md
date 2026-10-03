# Word Pool

**Word Pool** is a geometric puzzle disguised as a word game. A word is dropped into a pool as
chunky 3D letters, packed tight. Your job is to get every letter out — but a letter can only move
by *drawing itself*: an **I** slides straight, an **L** goes down and then across, a **C** sweeps
around its own curve, an **S** snakes. If anything is in the way, it bumps and stays put.
Figure out the order, draw the shapes, clear the word.

> Think *Block Away / Cube Away 3D*, but every block is a letter and the letter's own typography
> is the track it has to travel on.

## How to play

| Action | What happens |
| --- | --- |
| Drag a letter along the shape of its stroke (from either end) | The letter follows your finger along that path and pops out once it clears the pool. |
| Drag it into another letter | **Bump.** The blocker flashes red; the letter springs back. Something else has to move first. |
| Tap a letter | If it is touching nothing, it **pops** straight out. Closed letters like **O** / **o** can *only* leave this way. If it is still held, the neighbours holding it flash. |
| Hold a letter | Shows ghost paths: white dotted = clear exit, red = where it gets blocked. |
| 💡 | Highlights a letter that can move right now and its path. |

Three stars: clear the word with at most one bump and no hints.

Uppercase and lowercase glyphs are different puzzle pieces (**A** vs **a**, **G** vs **g**), and
later levels mix them. Pulling direction is decided by the letter's geometry:

| Letter | Track |
| --- | --- |
| I, l, T (stem) | straight line |
| L, Z, N, M, W, V | polyline with corners |
| C, c, U, J | sweeps along its arc |
| S, s | the full S curve |
| e, G, h, n, m, r, t, f, g, j | stroke + hook/arch |
| A, Y, K, k | multiple tracks (e.g. the Λ of the A, each arm of the Y) |
| O, o | no track — closed; pop only once free |

## Why this is interesting to build: the algorithm

Levels are **not hand-made**. Every level is generated from a word:

1. **Word engine** (`web/js/words.js`, `generator.js#levelSpec`) picks a word by length and a case
   mode (upper, Title, lower, mixed) for the level number.
2. **Glyph engine** (`web/js/glyphs.js`) turns each character into a monoline stroke skeleton plus
   its *tracks* — the paths the player has to draw. Rendering, collision and movement all come from
   the same stroke data, so what you see is exactly what collides.
3. **Puzzle generator** (`web/js/generator.js#pack`) uses *reverse construction*: letters are
   inserted in the reverse of a removal order, each one dropped only where it has a clear exit
   given the letters already present. Removing a letter never blocks anything, so the reversed
   insertion order is a guaranteed solution. Closed letters go in first so they end up free.
4. **Solver** (`web/js/engine.js#Board.solve`) re-verifies every candidate, counts how many letters
   are movable at each step and turns that into a hardness score. The generator keeps the candidate
   closest to the level's target hardness. Hardness grows with the level number.

Generation is deterministic (seeded by level number). `npm run build:levels` bakes 200 levels into
`web/levels.json` so the phone never waits; anything beyond that is generated on the fly with the
same code.

## Project layout

```
web/                 the game (plain ES modules, no framework, no build step)
  index.html         screens + canvas
  css/style.css
  js/geom.js         vector math, segment distance, arc sampling
  js/glyphs.js       the alphabet: strokes + tracks for A-Z a-z
  js/engine.js       Piece, Board, pull directions, sweeps, collision, solver
  js/generator.js    seeded RNG, difficulty curve, reverse-construction packer
  js/levels.js       loads levels.json / falls back to the generator
  js/render.js       pseudo-3D tube letters, pool, ghost paths, particles
  js/audio.js        synthesized sfx + haptics (Capacitor or Vibration API)
  js/game.js         screens, input (draw-to-pull), animation, persistence
  levels.json        200 pre-generated levels
tools/build-levels.mjs   regenerate levels.json
tools/build-single.mjs   bundle everything into dist/wordpool.html
tests/engine.test.mjs    unit tests (node --test)
tests/e2e.mjs            Playwright: plays level 1 in headless Chromium at iPhone size
ios/                 Capacitor iOS project (Xcode)
capacitor.config.json
```

## Run it

```bash
npm start            # serves web/ on http://localhost:8080
npm test             # engine + generator unit tests
npm run test:e2e     # needs `npm i -D playwright` (uses the bundled Chromium)
npm run build:levels # regenerate web/levels.json
npm run build:single # dist/wordpool.html — one file you can AirDrop or host anywhere
```

On an iPhone, Safari → Share → **Add to Home Screen** gives you a full-screen, offline-capable
version straight from any hosted copy of `web/`.

## Build the iPhone app (Xcode)

The native shell is [Capacitor 8](https://capacitorjs.com): the game runs in a WKWebView with native
haptics, portrait only. You need a Mac with Xcode 16+ and Node 20+.

```bash
npm install
npx cap sync ios       # copies web/ into the iOS project and installs plugins
npx cap open ios       # opens ios/App/App.xcodeproj in Xcode (Swift Package Manager, no CocoaPods)
```

In Xcode: select the **App** target → *Signing & Capabilities* → pick your team, then run on your
iPhone (or a simulator). The bundle id is `com.cyberallante.wordpool`; change it in
`capacitor.config.json` and in Xcode if you need to.

Haptics come from `@capacitor/haptics` when running inside the app and fall back to the web
Vibration API (which iOS Safari ignores) otherwise.

## Roadmap ideas

- Daily word, timed mode, streaks
- Letter "personality" tweaks (e.g. rotations for very hard levels)
- Obstacles in the pool (pegs, walls) for late-game difficulty
- Real-font glyph import (opentype.js) so themed fonts become themed puzzles
