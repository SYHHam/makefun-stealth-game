// PROMPT SIDE: main loop, screen stack, level loading.
// Screens are a stack: title, playing, paused, intermission, strikeLost,
// gameOver, victory. Only the top screen takes input, and the screen below
// gets its focus back when the top one closes. The simulation runs on a fixed
// timestep (1/60s) decoupled from rendering, so the game plays at the same
// speed on any display. The canvas buffer is scaled by devicePixelRatio
// (capped at 2) while CSS dimensions stay fixed, so the game is not blurry.

import { LEVELS, TILE } from './levels.js';
import { makeGuard, makeCamera, updateGuard, updateCamera, updateLasers, updatePlayerLight } from './guards.js';
import { makePlayer, updatePlayer, throwCoin, levelEntities } from './player.js';
import { makeCueBoard, fireCue, updateCues } from './cues.js';
import { drawGame, detectionLabel, uiScale, uiPanelWidth, uiTopHeight } from './render.js';
import { ACT_COUNT } from './levels.js';
import { makeAudio } from './audio.js';
import { makeInput } from './input.js';

const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  screens: ['title'],
  state: 'title',
  canvasW: 0,
  canvasH: 0,
  dpr: 1,
  view: { scale: 1, ox: 0, oy: 112 },
  levelIndex: 0,
  level: LEVELS[0],
  grid: [],
  player: null,
  guards: [],
  cameras: [],
  lasers: [],
  vents: [],
  desks: [],
  lamps: [],
  objective: null,
  exit: null,
  crowd: null,
  followspot: null,
  followspotPos: null,
  cues: makeCueBoard(3),
  coinsThrown: [],
  particles: [],
  score: 0,
  pages: 0,
  spotted: 0,
  spottedThisLevel: false,
  ghostThisLevel: false,
  time: 0,
  levelTime: 0,
  playerLight: 0.3,
  message: '',
  messageTimer: 0,
  loseReason: '',
  // Campaign state: persists across acts, resets only when a new run starts.
  // strikes is the recoverable-mistake budget, heat is the campaign-wide
  // suspicion that cues and mistakes feed and act completions cool down.
  // completedActs marks finished acts, actPages counts this act's page,
  // actTimes records each finished act's time, totalTime sums them.
  strikes: 3,
  heat: 0,
  completedActs: [false, false, false, false, false],
  actPages: 0,
  actTimes: [0, 0, 0, 0, 0],
  totalTime: 0,
  lastCompletedAct: -1,
  strikeReason: '',
  audio: makeAudio(),
  input: null,
  // HUD snapshot: discrete HUD values are updated only when a game event
  // changes them (score, suspicion, cue fired, objective collected, scene
  // changed, detection changed). The renderer reads this snapshot instead
  // of polling live game state for those values.
  hud: {
    score: 0,
    suspicion: 0,
    tokens: 3,
    pages: 0,
    spotted: 0,
    coins: 5,
    detection: 'UNSEEN',
    scene: 0,
    sceneTotal: 3,
    objective: '',
    message: '',
    hasObjective: false,
    levelName: '',
    levelScene: '',
    strikes: 3,
    heat: 0,
    completedActs: [false, false, false, false, false],
    actPages: 0,
    totalTime: 0,
  },
};

// Screen stack helpers. Only the top screen takes input.
game.setScreen = (name) => {
  game.screens = [name];
  game.state = name;
};

game.pushScreen = (name) => {
  game.screens.push(name);
  game.state = name;
};

game.popScreen = () => {
  if (game.screens.length > 1) game.screens.pop();
  game.state = game.screens[game.screens.length - 1];
};

game.emitHud = () => {
  const h = game.hud;
  h.score = game.score;
  h.suspicion = Math.floor(game.cues.suspicion);
  h.tokens = game.cues.tokens;
  h.pages = game.pages;
  h.spotted = game.spotted;
  h.coins = game.player ? game.player.coins : 0;
  h.detection = game.guards.length ? detectionLabel(game) : 'UNSEEN';
  h.scene = game.cues.scene;
  h.sceneTotal = 3;
  h.objective = game.level.objective;
  h.message = game.message;
  h.hasObjective = game.player ? game.player.hasObjective : false;
  h.levelName = game.level.name;
  h.levelScene = game.level.scene;
  h.strikes = game.strikes;
  h.heat = game.heat;
  h.completedActs = game.completedActs.slice();
  h.actPages = game.actPages;
  h.totalTime = game.totalTime;
};

game.setMessage = (text) => {
  game.message = text;
  game.messageTimer = 4;
  game.emitHud();
};

game.spawnBurst = (x, y, n) => {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 60;
    game.particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1,
      size: 1.5 + Math.random() * 2,
      color: '#f5d76e',
    });
  }
};

game.onSpotted = (kind) => {
  if (!game.spottedThisLevel) game.spottedThisLevel = true;
  game.spotted += 1;
  if (kind === 'seen') {
    game.cues.suspicion = Math.min(100, game.cues.suspicion + 3);
    game.setMessage('A stagehand has marked you. Slip back into shadow.');
  } else {
    game.cues.suspicion = Math.min(100, game.cues.suspicion + 6);
    game.setMessage('Spotted. Break line of sight and hide.');
  }
  game.emitHud();
  if (game.cues.suspicion >= 100) game.onCurtainDrop();
};

// Score page pickup hook. player.js calls this instead of doing the score
// math inline, so the campaign totals stay in one place.
game.onPagePickup = () => {
  game.pages += 1;
  game.actPages += 1;
  game.score += 250;
  game.audio.pickup();
  game.setMessage('Score page stolen. Now reach the exit, unseen.');
  game.emitHud();
};

// A recoverable mistake: being caught, tripping a camera, or crossing a
// laser. Costs one strike and adds heat, then the act restarts with the
// campaign (strikes, heat, score, pages, finished acts) kept. Losing the
// last strike, or heat hitting 100, ends the run for good.
game.loseStrike = (reason) => {
  if (game.state !== 'playing') return;
  game.strikes -= 1;
  game.spotted += 1;
  game.heat = Math.min(100, game.heat + (reason === 'caught' ? 15 : 10));
  game.strikeReason = reason;
  game.audio.lose();
  if (game.strikes <= 0) {
    game.endRun('Three strikes. The house wants you out.');
    return;
  }
  if (game.heat >= 100) {
    game.endRun('Heat maxed. The house is boiling.');
    return;
  }
  game.pushScreen('strikeLost');
  game.emitHud();
};

// Retry the current act after a strike, keeping the campaign state.
game.retryActAfterStrike = () => {
  game.popScreen();
  loadLevel(game.levelIndex);
  game.setScreen('playing');
};

game.endRun = (reason) => {
  game.loseReason = reason;
  game.setScreen('gameOver');
  game.audio.lose();
  game.emitHud();
};

// Trip a camera or a laser: the caller adds House Suspicion first, then
// this spends the strike. Called from guards.js.
game.onTrip = (kind) => {
  game.loseStrike(kind);
};

// Summary of the run so far, for the intermission and victory screens.
game.actSummary = () => ({
  act: game.levelIndex + 1,
  name: game.level.name,
  actPages: game.actPages,
  campaignPages: game.pages,
  score: game.score,
  strikes: game.strikes,
  heat: game.heat,
  completedActs: game.completedActs.slice(),
  next: game.levelIndex + 2,
});

// Deterministic showcase states for screenshots (?showcase=cover|act1|
// act2complete|act5). A seeded LCG replaces Math.random for the showcase so
// camera sweep angles and dust are reproducible. The showcase never changes
// costs, durations, or detection; it only sets campaign state and level.
game.applyShowcase = (name) => {
  let seed = 12345;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  if (name === 'cover') {
    loadLevel(2);
    game.completedActs = [true, true, false, false, false];
    game.pages = 3;
    game.actPages = 1;
    game.score = 4250;
    game.strikes = 2;
    game.heat = 35;
    game.levelTime = 145;
    game.cues.suspicion = 42;
    game.cues.tokens = 3;
    game.player.coins = 2;
    game.setScreen('playing');
  } else if (name === 'act1') {
    loadLevel(0);
    game.completedActs = [false, false, false, false, false];
    game.pages = 1;
    game.actPages = 1;
    game.score = 250;
    game.strikes = 3;
    game.heat = 0;
    game.levelTime = 18;
    game.cues.suspicion = 12;
    game.cues.tokens = 4;
    game.player.coins = 2;
    game.setScreen('playing');
  } else if (name === 'act2complete') {
    loadLevel(1);
    game.completedActs = [true, true, false, false, false];
    game.pages = 2;
    game.actPages = 1;
    game.score = 2600;
    game.strikes = 2;
    game.heat = 25;
    game.actTimes[1] = 96;
    game.lastCompletedAct = 1;
    game.pushScreen('intermission');
  } else if (name === 'act5') {
    loadLevel(4);
    game.completedActs = [true, true, true, true, true];
    game.pages = 5;
    game.actPages = 1;
    game.score = 9150;
    game.strikes = 1;
    game.heat = 60;
    game.totalTime = 612;
    game.lastCompletedAct = 4;
    game.pushScreen('victory');
  }
  game.emitHud();
};

game.onCaught = () => {
  game.loseStrike('caught');
};

game.onCurtainDrop = () => {
  game.endRun('House Suspicion hit 100 percent. The curtain drops.');
};

game.onLevelComplete = () => {
  if (game.state !== 'playing') return;
  game.ghostThisLevel = !game.spottedThisLevel;
  let bonus = 500;
  if (game.ghostThisLevel) bonus += 500;
  bonus += Math.max(0, 300 - Math.floor(game.levelTime));
  game.score += bonus;
  game.completedActs[game.levelIndex] = true;
  game.actTimes[game.levelIndex] = game.levelTime;
  game.totalTime += game.levelTime;
  game.lastCompletedAct = game.levelIndex;
  game.heat = Math.max(0, game.heat - 10);
  game.audio.win();
  if (game.levelIndex >= LEVELS.length - 1) {
    game.pushScreen('victory');
  } else {
    game.pushScreen('intermission');
  }
  game.emitHud();
};

function loadLevel(index) {
  const level = LEVELS[index];
  game.levelIndex = index;
  game.level = level;
  game.grid = level.map.map((row) => row.split(''));
  const ent = levelEntities(game.grid);
  game.player = makePlayer(ent.start);
  game.player.coins = level.coins;
  game.objective = ent.objective;
  game.exit = ent.exit;
  game.lamps = ent.lamps.concat((level.lamps || []).map(([tx, ty]) => ({
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
  })));
  game.guards = level.guards.map((g) => makeGuard(g, game.grid));
  game.cameras = (level.cameras || []).map((c) => makeCamera(c));
  game.lasers = (level.lasers || []).map((l) => ({ ...l, cooldown: 0 }));
  game.vents = [];
  for (const v of level.vents || []) {
    game.vents.push({ x: (v[0] + 0.5) * TILE, y: (v[1] + 0.5) * TILE });
    game.vents.push({ x: (v[2] + 0.5) * TILE, y: (v[3] + 0.5) * TILE });
  }
  game.desks = (level.desks || []).map(([tx, ty]) => ({
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
    used: false,
    near: false,
  }));
  game.crowd = (level.crowd || []).map(([tx, ty]) => ({
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
  }));
  game.followspot = level.followspot || null;
  game.cues = makeCueBoard(level.cueTokens);
  game.cues.sceneDuration = level.sceneDuration;
  game.coinsThrown = [];
  game.particles = [];
  game.spottedThisLevel = false;
  game.ghostThisLevel = false;
  game.actPages = 0;
  game.levelTime = 0;
  game.message = '';
  game.messageTimer = 0;
  game.setMessage(level.name + '. ' + level.objective);
  fitView();
  game.emitHud();
}

function startGame() {
  game.score = 0;
  game.pages = 0;
  game.spotted = 0;
  game.strikes = 3;
  game.heat = 0;
  game.completedActs = [false, false, false, false, false];
  game.actPages = 0;
  game.actTimes = [0, 0, 0, 0, 0];
  game.totalTime = 0;
  game.lastCompletedAct = -1;
  game.strikeReason = '';
  loadLevel(0);
  game.setScreen('playing');
}

function nextLevel() {
  game.popScreen();
  loadLevel(game.levelIndex + 1);
  game.setScreen('playing');
}

function fitView() {
  if (!game.grid.length || !game.grid[0]) return;
  const gridW = game.grid[0].length * TILE;
  const gridH = game.grid.length * TILE;
  // The world view fits the space left after the anchored HUD: the campaign
  // panel on the left, the side panel on the right, and the scaled top area
  // (top bar plus goal and message lines). At the 1280x720 reference the
  // rect is left 232, top 112, right 984, bottom 712, so the world never
  // slides under the campaign panel or the goal and message lines.
  const s = uiScale(game);
  const panelW = uiPanelWidth(game);
  const topH = uiTopHeight(game);
  const left = Math.round(232 * s);
  const right = game.canvasW - panelW - 8;
  const bottom = game.canvasH - 8;
  const availW = Math.max(200, right - left);
  const availH = Math.max(200, bottom - topH);
  const scale = Math.min(availW / gridW, availH / gridH);
  game.view.scale = scale;
  game.view.ox = left + (availW - gridW * scale) / 2;
  game.view.oy = topH + (availH - gridH * scale) / 2;
}

function resize() {
  game.canvasW = window.innerWidth;
  game.canvasH = window.innerHeight;
  // Scale the canvas buffer by devicePixelRatio (capped at 2) while the CSS
  // size stays at the window size, so the game is sharp, not blurry.
  game.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(game.canvasW * game.dpr);
  canvas.height = Math.round(game.canvasH * game.dpr);
  fitView();
}

window.addEventListener('resize', resize);

function screenToWorld(sx, sy) {
  return {
    x: (sx - game.view.ox) / game.view.scale,
    y: (sy - game.view.oy) / game.view.scale,
  };
}

game.input = makeInput(canvas, {
  onKey(code) {
    // Audio starts only after a user gesture, so start it on any keypress.
    game.audio.ensure();
    if (code === 'Enter') {
      if (game.state === 'title') startGame();
      else if (game.state === 'intermission') nextLevel();
      else if (game.state === 'strikeLost') game.retryActAfterStrike();
      else if (game.state === 'gameOver') startGame();
      else if (game.state === 'victory') startGame();
    }
    if (code === 'Escape') {
      if (game.state === 'playing') game.pushScreen('paused');
      else if (game.state === 'paused') game.popScreen();
      else if (game.state === 'strikeLost') game.retryActAfterStrike();
    }
    if (code === 'KeyR') {
      if (game.state === 'playing' || game.state === 'paused' || game.state === 'gameOver' || game.state === 'strikeLost') {
        loadLevel(game.levelIndex);
        game.setScreen('playing');
      }
    }
    if (code === 'KeyM') {
      game.audio.ensure();
      const muted = game.audio.toggleMute();
      game.setMessage(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (game.state === 'playing') {
      if (code === 'Digit1') fireCue(game, 1);
      if (code === 'Digit2') fireCue(game, 2);
      if (code === 'Digit3') fireCue(game, 3);
      if (code === 'Digit4') fireCue(game, 4);
    }
  },
  onClick(sx, sy) {
    // Audio starts only after a user gesture, so start it on the first click.
    game.audio.ensure();
    if (game.state === 'title') {
      startGame();
      return;
    }
    if (game.state === 'playing') {
      const w = screenToWorld(sx, sy);
      throwCoin(game, w.x, w.y);
    }
  },
});

function update(dt) {
  game.time += dt;
  if (game.state !== 'playing') return;
  game.levelTime += dt;
  if (game.messageTimer > 0) {
    game.messageTimer -= dt;
    if (game.messageTimer <= 0) {
      game.message = '';
      game.emitHud();
    }
  }
  updateCues(game, dt);
  updatePlayer(game, dt);
  updatePlayerLight(game);
  for (const g of game.guards) updateGuard(game, g, dt);
  for (const cam of game.cameras) updateCamera(game, cam, dt);
  updateLasers(game, dt);
  updateParticles(dt);
  spawnDust(dt);
  // Detection state is event driven: the HUD snapshot updates only when
  // the label actually changes, not every frame.
  const label = detectionLabel(game);
  if (label !== game.hud.detection) game.emitHud();
  if (game.cues.suspicion >= 100) game.onCurtainDrop();
}

let dustTimer = 0;
function spawnDust(dt) {
  dustTimer -= dt;
  if (dustTimer > 0 || game.lamps.length === 0) return;
  dustTimer = 0.25;
  const lamp = game.lamps[Math.floor(Math.random() * game.lamps.length)];
  game.particles.push({
    x: lamp.x + (Math.random() - 0.5) * 70,
    y: lamp.y + (Math.random() - 0.5) * 70,
    vx: (Math.random() - 0.5) * 6,
    vy: 4 + Math.random() * 6,
    life: 2.5,
    maxLife: 2.5,
    size: 1 + Math.random() * 1.5,
    color: 'rgba(245, 220, 150, 0.8)',
  });
}

function updateParticles(dt) {
  for (const pt of game.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += frameDt;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  // All drawing happens in CSS pixel coordinates; the transform maps them
  // onto the DPR scaled buffer.
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  drawGame(ctx, game);
  requestAnimationFrame(frame);
}

resize();
const showcase = new URLSearchParams(location.search).get('showcase');
if (showcase) {
  game.applyShowcase(showcase);
} else {
  loadLevel(0);
  game.setScreen('title');
}
window.__game = game;
requestAnimationFrame(frame);
