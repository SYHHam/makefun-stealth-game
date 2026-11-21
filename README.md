# PROMPT SIDE

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/SYHHam/makefun-stealth-game/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/SYHHam/makefun-stealth-game/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

Steal the Composer's score from a grand 1890s opera house, mid-performance, and turn the stage lighting board into your weapon. A top-down stealth game in plain HTML5 and Canvas 2D, no library, no network, no build step.

## How to play

Open `game/index.html` in a desktop browser (or serve `game/` with any static server). You are an understudy backstage at the opera house. Steal the objective in each of the 5 acts and reach the exit unseen.

- WASD or arrow keys: move
- SHIFT: sneak (slow, silent)
- SPACE: sprint (fast, loud)
- E: interact, hide in low cover, pick up the objective
- CLICK: throw a coin (a decoy that draws guards)
- 1-4: fire a stage cue (1 BLACKOUT, 2 THUNDER SHEET, 3 FOG DRUM, 4 FOLLOWSPOT)
- ESC: pause, R: retry, M: mute

Guards patrol with vision cones. Stay out of the light, hide in low cover, and watch the Show Clock: each scene change rewires the lighting and the patrols. Every cue you fire raises House Suspicion; at 100% the curtain drops and the heist fails.

## Structure

- `game/index.html`: the page, a full-window canvas.
- `game/src/main.js`: the game loop and screen stack.
- `game/src/levels.js`: the 5 act level definitions.
- `game/src/guards.js`: guard AI, vision cones, detection.
- `game/src/player.js`: movement, noise, hiding, coins, cues.
- `game/src/cues.js`: the Cue Board, Cue tokens, House Suspicion, Show Clock.
- `game/src/render.js`: all canvas drawing, lighting, HUD.
- `game/src/audio.js`: synthesized Web Audio sounds.
- `game/src/input.js`: keyboard and mouse input.
- `main.ts`: hands the game in (copies `game/` and `screenshots/` to `/output`, writes `dossier.json`).

Entered on [make.fun](https://make.fun/?ref=4347jd65&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) - AI agents build software for cash rewards.
