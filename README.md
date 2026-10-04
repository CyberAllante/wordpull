# Word Pool

**Word Pool** is a geometric puzzle disguised as a word game. A word is dropped into a pool as
chunky 3D letters, packed tight. Your job is to get every letter out — but a letter is a rope lying
in a groove shaped like itself. Grab it and draw along its shape and it slides out of its own
outline: an **S** snakes out of itself, a **C** unspools around its curve, an **E** feeds its
arms back through its spine. Once the rope leaves the groove it runs straight out of the open end.
If anything sits in that corridor, it bumps and stays put. Figure out the order, draw the shapes,
clear the word.

> Think *Block Away / Cube Away 3D*, but every block is a letter and the letter's own typography
> is the track it has to travel on.

## How to play

| Action | What happens |
| --- | --- |
| Grab a letter and draw along its shape toward an open end | The rope slides along its own groove, then straight out of that end, and pops once it clears the pool. |
| Drag it into another letter | **Bump.** The blocker flashes red; the letter springs back. Something else has to move first. |
| Tap a letter | If it is touching nothing, it **pops** straight out. Closed letters like **O** / **o** can *only* leave this way. If it is still held, the neighbours holding it flash. |
| Hold a letter | Shows ghost paths: white dotted = clear exit, red = where it gets blocked. |
| 💡 | Highlights a letter that can move right now and its path. |

Three stars: clear the word with at most one bump and no boosters.

## Meta game

| System | How it works |
| --- | --- |
| **Hearts (bumps)** | Each level gives 3 + ⌊letters/2⌋ hearts. Every bump costs one. At zero the round pauses: continue for 🪙 50 (+3 hearts), skip for 🪙 120, retry, or go home. |
| **Coins 🪙** | Earned per clear (base + word length + star bonus; replays pay 25%). Three perfect clears in a row doubles payouts ("on fire"). Spent on boosters and continues. |
| **Crowns 👑** | One per level cleared with 3 stars, plus one per daily challenge. Crowns unlock themes. |
| **Boosters** | 💡 Hint (🪙 30) shows a letter that can escape and its path. 🫧 Pop (🪙 80) removes any letter, blockers or not. 🔍 Reveal (🪙 50) shows every clear exit for 6 s. Using one caps the round at 2 stars. |
| **Chapters** | 10 levels each, named (Shallows, Tide Pool, Reef…). Clearing all 10 opens a chest: coins + a booster. |
| **Daily gift** | 7-day login streak: 25, 35, 50, 20+Hint, 75, 30+Pop, 150+Reveal. Miss a day and it restarts. |
| **Daily challenge** | One long mixed-case word per day, seeded by the date and generated on the device. +🪙 100 and a crown. |
| **Themes** | Lagoon (default), Candy Shop (5 👑), Lava Vent (15 👑), Midnight Neon (30 👑), Royal Gold (60 👑). Themes recolor letters, pool and background. |

All of this lives in `web/js/economy.js` as pure functions over the save object (tested in
`tests/economy.test.mjs`), so prices, curves and rewards are one file to tune. Saves migrate from
the v1 format automatically.

### Real-money purchases

The Shop has a coin-pack section that is informational in this build. For the App Store release,
add a StoreKit bridge (for example `@capacitor-community/in-app-purchases` or RevenueCat's
Capacitor SDK), define coin-pack products in App Store Connect, and on a verified purchase call
`save.coins += pack.coins` followed by `persist()`. Rewarded ads (AdMob via `@capacitor-community/admob`)
can slot into the same place as "watch to continue" if you want them.

Uppercase and lowercase glyphs are different puzzle pieces (**A** vs **a**, **G** vs **g**), and
later levels mix them. Every glyph is one continuous stroke (with retraces where a pen would lift,
like the middle arm of an **E**), and its *open ends* decide where it can leave:

| Letter | Open ends |
| --- | --- |
| I, L, C, S, U, V, W, Z, c, s, v, w, z … | both ends: pull from either |
| E, F, H, K, T, X, Y, R, f, h, k, m, t, u, x, y | both ends, with the extra strokes folded into the rope |
| A, B, D, P, G, Q, a, b, d, p, q | one end — the other finishes inside the letter (a bowl, a crossbar) |
| e, g | one end: the tail / the hook |
| i, j | both ends; the dot rides along |
| O, o | none — closed; pop only once free |

## Why this is interesting to build: the algorithm

Levels are **not hand-made**. Every level is generated from a word:

1. **Word engine** (`web/js/words.js`, `generator.js#levelSpec`) picks a word by length and a case
   mode (upper, Title, lower, mixed) for the level number.
2. **Glyph engine** (`web/js/glyphs.js`) defines each character as one continuous rope path with
   open/closed ends. The engine (`engine.js`) builds a *rail* per open end (the path plus a straight
   exit ray); at progress *s* the rope occupies rail length [s, s+L]. Rendering, collision and
   movement all come from the same path, so what you see is exactly what collides.
3. **Puzzle generator** (`web/js/generator.js#pack`) uses *reverse construction*: letters are
   inserted in the reverse of a removal order, each one dropped only where it has a clear exit
   given the letters already present. Removing a letter never blocks anything, so the reversed
   insertion order is a guaranteed solution. Candidates are aimed into earlier letters' exit
   corridors so each letter tends to lock the one placed before it. Closed letters go in first.
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
  js/economy.js      coins, crowns, boosters, hearts, daily rewards, chapters, chests (pure, tested)
  js/themes.js       unlockable color themes
  js/game.js         screens, input (draw-to-pull), boosters, modals, animation, persistence
  levels.json        200 pre-generated levels
tools/build-levels.mjs   regenerate levels.json
tools/build-single.mjs   bundle everything into dist/wordpool.html
tests/engine.test.mjs    engine + generator unit tests (node --test)
tests/economy.test.mjs   economy unit tests
tests/levels.test.mjs    validates every shipped level
tests/e2e.mjs            Playwright: claims the daily gift, plays level 1, drains hearts, uses boosters, shops, opens a chest
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

- Timed "blitz" mode and weekly leaderboards (Game Center)
- Letter "personality" tweaks (e.g. rotations for very hard levels)
- Obstacles in the pool (pegs, walls) for late-game difficulty
- Real-font glyph import (opentype.js) so themed fonts become themed puzzles
