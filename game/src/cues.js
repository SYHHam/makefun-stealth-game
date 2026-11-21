// The Cue Board: four stage cues fired from a prompt desk or a stolen remote.
// Every cue costs one Cue token and raises House Suspicion. At 100 percent
// suspicion the curtain drops and the heist fails. The Show Clock advances
// scenes on its own, changing the lighting tint and the patrol tempo.

export const CUES = [
  {
    key: '1',
    name: 'BLACKOUT',
    desc: 'Vision cones collapse to lantern pinholes. Guards freeze for 6s.',
    duration: 6,
  },
  {
    key: '2',
    name: 'THUNDER SHEET',
    desc: 'Applause and thunder mask all your noise for 5s. Sprint freely.',
    duration: 5,
  },
  {
    key: '3',
    name: 'FOG DRUM',
    desc: 'Fog shortens cones 40 percent for 10s, but you show up in any beam.',
    duration: 10,
  },
  {
    key: '4',
    name: 'FOLLOWSPOT',
    desc: 'Pins the nearest guard, who stares into the lamp, blinded, for 8s.',
    duration: 8,
  },
];

export const SUSPICION_PER_CUE = 15;

export function makeCueBoard(tokens) {
  return {
    tokens,
    suspicion: 0,
    blackout: 0,
    thunder: 0,
    fog: 0,
    followspot: 0,
    followspotTarget: null,
    scene: 0,
    sceneTimer: 0,
    sceneDuration: 45,
  };
}

// Fire cue number 1..4. Returns true when it fired, false when it could not.
export function fireCue(game, n) {
  const cues = game.cues;
  if (game.state !== 'playing') return false;
  if (n < 1 || n > 4) return false;
  if (cues.tokens <= 0) {
    game.setMessage('No Cue tokens left. Find a cue desk.');
    return false;
  }
  const def = CUES[n - 1];
  cues.tokens -= 1;
  cues.suspicion = Math.min(100, cues.suspicion + SUSPICION_PER_CUE);
  if (n === 1) {
    cues.blackout = def.duration;
    for (const g of game.guards) {
      if (g.state === 'PATROL') g.pauseTimer = Math.max(g.pauseTimer, def.duration);
    }
    game.setMessage('BLACKOUT. The house holds its breath.');
    game.audio.cueBlackout();
  } else if (n === 2) {
    cues.thunder = def.duration;
    game.setMessage('THUNDER SHEET. Applause swallows every sound.');
    game.audio.cueThunder();
  } else if (n === 3) {
    cues.fog = def.duration;
    game.setMessage('FOG DRUM. The boards disappear into fog.');
    game.audio.cueFog();
  } else {
    cues.followspot = def.duration;
    let nearest = null;
    let best = Infinity;
    for (const g of game.guards) {
      const d = Math.hypot(g.x - game.player.x, g.y - game.player.y);
      if (d < best) { best = d; nearest = g; }
    }
    if (nearest) {
      nearest.stunned = def.duration;
      nearest.state = 'PATROL';
      nearest.detect = 0;
      cues.followspotTarget = nearest;
      game.setMessage('FOLLOWSPOT. A stagehand stares into the lamp, blinded.');
    } else {
      game.setMessage('FOLLOWSPOT. No guard near enough to pin.');
    }
    game.audio.cueFollowspot();
  }
  game.spawnBurst(game.player.x, game.player.y, 14);
  // Every cue feeds the campaign heat as well as House Suspicion. At 100
  // heat the run ends, so cues are a budget, not a free button.
  game.heat = Math.min(100, game.heat + 5);
  if (game.emitHud) game.emitHud();
  if (game.heat >= 100) {
    game.endRun('Heat maxed. The house is boiling.');
    return true;
  }
  if (cues.suspicion >= 100) game.onCurtainDrop();
  return true;
}

export function updateCues(game, dt) {
  const cues = game.cues;
  cues.blackout = Math.max(0, cues.blackout - dt);
  cues.thunder = Math.max(0, cues.thunder - dt);
  cues.fog = Math.max(0, cues.fog - dt);
  cues.followspot = Math.max(0, cues.followspot - dt);
  if (cues.followspot <= 0) cues.followspotTarget = null;

  // The Show Clock: scenes advance on their own, tint shifts, patrols quicken.
  cues.sceneTimer += dt;
  if (cues.sceneTimer >= cues.sceneDuration) {
    cues.sceneTimer = 0;
    cues.scene = (cues.scene + 1) % 3;
    const names = ['Scene shifts. The gel wash changes.', 'A new scene begins. Patrols quicken.', 'The act turns. The house leans in.'];
    game.setMessage(names[cues.scene]);
    game.audio.sceneShift();
    if (game.emitHud) game.emitHud();
  }
}
