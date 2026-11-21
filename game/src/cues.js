// PROMPT SIDE: the Cue Board. One file, one job: the four stage cues
// the player fires with keys 1-4. A cue rewires light, sound and guard
// behavior for a few seconds, and every cue costs one Cue token and
// raises House Suspicion. The effects live on game.cueFx so guards.js
// and render.js can read them; this file only starts and counts them down.

export const CUES = [
  {
    id: 'blackout',
    key: '1',
    name: 'BLACKOUT',
    blurb: 'cones collapse, guards freeze',
    dur: 6,
  },
  {
    id: 'thunder',
    key: '2',
    name: 'THUNDER SHEET',
    blurb: 'applause masks all noise',
    dur: 5,
  },
  {
    id: 'fog',
    key: '3',
    name: 'FOG DRUM',
    blurb: 'cones shorten, silhouette shows',
    dur: 8,
  },
  {
    id: 'followspot',
    key: '4',
    name: 'FOLLOWSPOT',
    blurb: 'pins one guard, blinded',
    dur: 8,
  },
];

export function cueByKey(key) {
  return CUES.find((c) => c.key === key) || null;
}

export function createCueFx() {
  return {
    blackout: 0,
    thunder: 0,
    fog: 0,
    followspot: 0,
    followspotGuard: null,
  };
}

// Fire one cue. Returns true when it went off, false when it could not
// (no tokens, or the game is not in play). The cost is paid here:
// one token, 5 heat, 15 house suspicion.
export function fireCue(game, id) {
  if (game.state !== 'playing') return false;
  if (game.cueTokens <= 0) {
    game.setMessage('No Cue tokens left.');
    return false;
  }
  const cue = CUES.find((c) => c.id === id);
  if (!cue) return false;
  game.cueTokens -= 1;
  game.addHeat(5);
  game.addSuspicion(15);
  if (id === 'blackout') {
    game.cueFx.blackout = cue.dur;
    game.setMessage('BLACKOUT. The house holds its breath.');
  } else if (id === 'thunder') {
    game.cueFx.thunder = cue.dur;
    game.setMessage('THUNDER SHEET. Applause covers your steps.');
  } else if (id === 'fog') {
    game.cueFx.fog = cue.dur;
    game.setMessage('FOG DRUM. The cones shrink, but you stand out in any beam.');
  } else if (id === 'followspot') {
    game.cueFx.followspot = cue.dur;
    game.cueFx.followspotGuard = nearestGuard(game);
    game.setMessage('FOLLOWSPOT. One guard stares into the lamp.');
  }
  game.sound.cue();
  return true;
}

// The guard nearest the player, for FOLLOWSPOT to pin.
function nearestGuard(game) {
  let best = null;
  let bestD = Infinity;
  for (const g of game.guards) {
    const dx = g.x - game.player.x;
    const dy = g.y - game.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

// Count the active effects down. Called once per frame from main.js.
export function updateCues(game, dt) {
  const fx = game.cueFx;
  if (fx.blackout > 0) fx.blackout = Math.max(0, fx.blackout - dt);
  if (fx.thunder > 0) fx.thunder = Math.max(0, fx.thunder - dt);
  if (fx.fog > 0) fx.fog = Math.max(0, fx.fog - dt);
  if (fx.followspot > 0) {
    fx.followspot = Math.max(0, fx.followspot - dt);
    if (fx.followspot === 0) fx.followspotGuard = null;
  }
}

// Applause mask, 0 to 1. While THUNDER SHEET runs, all noise is masked.
export function applauseMask(game) {
  return game.cueFx.thunder > 0 ? 1 : 0;
}

// Cone length multiplier from the active cues.
export function coneRangeFactor(game) {
  let f = 1;
  if (game.cueFx.blackout > 0) f *= 0.25;
  if (game.cueFx.fog > 0) f *= 0.6;
  return f;
}

// True while the guards are frozen by BLACKOUT.
export function guardsFrozen(game) {
  return game.cueFx.blackout > 0;
}

// True when this guard is pinned by FOLLOWSPOT and cannot see.
export function guardBlinded(game, guard) {
  return game.cueFx.followspot > 0 && game.cueFx.followspotGuard === guard;
}
