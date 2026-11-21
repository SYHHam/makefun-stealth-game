// main.ts
//
// Hand-in entrypoint for PROMPT SIDE, a stealth game built for make.fun's
// best stealth game bounty. Runs on Node 22 with the standard library only.
//
// What it does: it copies this repository's game/ and screenshots/ folders
// into the output directory (by default /output) and writes dossier.json
// there, the summary the judge reads. The dossier is produced with the
// vendored make.fun library, not by hand.
//
// The game itself is plain static files that a desktop browser loads
// offline: game/index.html plus its ES modules, no library code and no
// network request at all.
//
// When you run this outside the grader's container, set MAKEFUN_OUTPUT_DIR
// to pick a local folder instead of /output, for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// About the scorer's caps: only text_max_bytes shapes how many bytes of
// text the dossier keeps. The other caps refuse an entry the scorer would
// refuse anyway, more than 4 screenshots or any one over 256 KiB, more
// than 993 files under game/ or 48 MiB of game files in total, or any path
// under game/ longer than 1000 bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, so the copy works wherever the repo sits.
const here = fileURLToPath(new URL('.', import.meta.url));

// Where the hand-in goes. The grader uses /output; a local run can point
// somewhere else with MAKEFUN_OUTPUT_DIR.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Lay out the output directory and copy the game in.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// Screenshots go in their own folder; copy them only if they are there.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), {
    recursive: true,
  });
}

// Summarise the hand-in for the judge and write it next to the game.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
