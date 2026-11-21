// PROMPT SIDE: the game itself. One file, one job: it owns the game
// object, the loop, the screens and the campaign. It wires the other
// modules together (levels, guards, player, cues, audio, input, render)
// and never draws a pixel or moves a guard on its own.
// The campaign (acts, pages, score, strikes, heat) persists across acts.
// A strike costs one of three strikes and adds heat; the act restarts
// with the campaign kept. Three strikes, heat 100 or suspicion 100
// ends the run.

import { LEVELS, ACT_COUNT, TILE, lampTiles, tileCenter } from './levels.js';
import { createGuards, createCameras, createLasers, updateGuards, updateCameras, updateLasers, playerLux, worstSuspicion } from './guards.js';
import { createPlayer, updatePlayer } from './player.js';
import { createCueFx, fireCue, updateCues, cueByKey } from './cues.js';
import { createInput } from './input.js';
import { sound } from './audio.js';
import { draw, createView, CANVAS_W, CANVAS_H } from './render.js';

const SCENE_LEN = 45;
const STEP = 1 / 60;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createGame() {
  return {
    levelIndex: 0,
    level: LEVELS[0],
    lamps: [],
    guards: [],
    cameras: [],
    lasers: [],
    player: null,
    state: 'title',
    screens: [],
    view: null,
    input: null,
    sound,
    cueFx: createCueFx(),
    levelTime: 0,
    time: 0,
    sceneIndex: 0,
    strobe: 0,
    suspicion: 0,
    score: 0,
    pages: 0,
    actPages: 0,
    strikes: 3,
    heat: 0,
    spotted: 0,
    actSpotted: 0,
    completedActs: new Array(ACT_COUNT).fill(false),
    actTimes: new Array(ACT_COUNT).fill(0),
    totalTime: 0,
    lastCompletedAct: -1,
    strikeReason: '',
    loseReason: '',
    objectiveTaken: false,
    coins: 0,
    cueTokens: 0,
    coinLure: null,
    coinsThrown: [],
    lux: 0.3,
    status: 'UNSEEN',
    message: '',
    messageT: 0,
    started: false,
  };
}

function pushScreen(game, name) {
  game.screens.push(name);
  game.state = name;
}

function popScreen(game) {
  game.screens.pop();
  game.state = game.screens[game.screens.length - 1] || 'title';
}

function setScreen(game, name) {
  game.screens = [name];
  game.state = name;
}

// Load one act. Campaign totals (strikes, heat, score, pages,
// completedActs) survive; the act-local state resets.
export function loadLevel(game, index) {
  game.levelIndex = index;
  game.level = LEVELS[index];
  game.lamps = lampTiles(game.level);
  game.guards = createGuards(game.level);
  game.cameras = createCameras(game.level);
  game.lasers = createLasers(game.level);
  game.player = createPlayer(game.level.spawn);
  game.levelTime = 0;
  game.sceneIndex = 0;
  game.strobe = 0;
  game.suspicion = 0;
  game.actPages = 0;
  game.actSpotted = 0;
  game.objectiveTaken = false;
  game.coins = game.level.coins;
  game.cueTokens = game.level.cueTokens;
  game.cueFx = createCueFx();
  game.coinLure = null;
  game.coinsThrown = [];
  game.status = 'UNSEEN';
  game.lux = 0.3;
  // The banner always names the act just loaded, so a showcase that
  // jumps to a later act never shows a stale earlier act's banner.
  game.setMessage('Act ' + (index + 1) + ': ' + game.level.name + '. ' + game.level.actGoal);
}

export function startGame(game) {
  game.score = 0;
  game.pages = 0;
  game.actPages = 0;
  game.strikes = 3;
  game.heat = 0;
  game.spotted = 0;
  game.actSpotted = 0;
  game.completedActs = new Array(ACT_COUNT).fill(false);
  game.actTimes = new Array(ACT_COUNT).fill(0);
  game.totalTime = 0;
  game.lastCompletedAct = -1;
  game.strikeReason = '';
  game.loseReason = '';
  game.started = true;
  loadLevel(game, 0);
  setScreen(game, 'playing');
  game.setMessage('Act 1: Half-Hour Call. Steal the score page, then reach the exit.');
}

// --- Campaign hooks, called by the other modules. ---

function addMethods(game) {
  game.setMessage = (msg) => {
    game.message = msg;
    game.messageT = 4;
  };
  game.addHeat = (n) => {
    game.heat = clamp(game.heat + n, 0, 100);
    if (game.heat >= 100) endRun(game, 'HEAT MAXED. THE HOUSE IS BOILING.');
  };
  game.addSuspicion = (n) => {
    game.suspicion = clamp(game.suspicion + n, 0, 100);
    if (game.suspicion >= 100) endRun(game, 'HOUSE SUSPICION HIT 100%. THE CURTAIN DROPS.');
  };
  game.onPagePickup = () => {
    game.pages += 1;
    game.actPages += 1;
    game.score += 250;
    game.sound.pickup();
    game.setMessage('Score page taken. Now reach the exit, unseen.');
  };
  game.onCaught = () => {
    loseStrike(game, 'caught');
  };
  game.onTrip = (kind) => {
    loseStrike(game, kind);
  };
  game.onLevelComplete = () => {
    if (game.state !== 'playing') return;
    const ghost = game.actSpotted === 0;
    if (ghost) game.score += 500;
    game.completedActs[game.levelIndex] = true;
    game.actTimes[game.levelIndex] = game.levelTime;
    game.totalTime += game.levelTime;
    game.lastCompletedAct = game.levelIndex;
    game.heat = Math.max(0, game.heat - 10);
    game.sound.fanfare();
    if (ghost) game.setMessage('GHOST +500. No one saw a thing.');
    if (game.levelIndex === ACT_COUNT - 1) {
      pushScreen(game, 'victory');
    } else {
      pushScreen(game, 'intermission');
    }
  };
}

function loseStrike(game, reason) {
  if (game.state !== 'playing') return;
  game.strikes -= 1;
  game.spotted += 1;
  game.actSpotted += 1;
  game.heat = clamp(game.heat + (reason === 'caught' ? 15 : 10), 0, 100);
  game.strikeReason = reason;
  game.sound.caught();
  if (game.strikes <= 0) {
    endRun(game, 'THREE STRIKES. THE HOUSE WANTS YOU OUT.');
  } else if (game.heat >= 100) {
    endRun(game, 'HEAT MAXED. THE HOUSE IS BOILING.');
  } else {
    pushScreen(game, 'strikeLost');
  }
}

function retryActAfterStrike(game) {
  popScreen(game);
  loadLevel(game, game.levelIndex);
  game.state = 'playing';
  game.setMessage('The act restarts. One strike spent.');
}

function retryAct(game) {
  loadLevel(game, game.levelIndex);
  setScreen(game, 'playing');
  game.setMessage('The act restarts.');
}

function endRun(game, reason) {
  game.loseReason = reason;
  pushScreen(game, 'gameOver');
}

function nextLevel(game) {
  popScreen(game);
  loadLevel(game, game.levelIndex + 1);
  game.state = 'playing';
  game.setMessage('Act ' + (game.levelIndex + 1) + ': ' + game.level.name + '. ' + game.level.actGoal);
}

export function actSummary(game) {
  return {
    act: game.levelIndex + 1,
    name: game.level.name,
    actPages: game.actPages,
    campaignPages: game.pages,
    score: game.score,
    strikes: game.strikes,
    heat: game.heat,
    completedActs: game.completedActs.slice(),
    next: game.levelIndex + 2,
  };
}

// --- Showcase states for the screenshots. Deterministic: guards start
// on their first waypoint, cameras and lasers start at phase zero, and
// the dust motes run off levelTime, so the same state renders the same.
export function applyShowcase(game, name) {
  startGame(game);
  if (name === 'cover') {
    loadLevel(game, 2);
    game.completedActs = [true, true, false, false, false];
    game.pages = 3;
    game.actPages = 1;
    game.score = 4250;
    game.strikes = 2;
    game.heat = 35;
    game.levelTime = 145;
    game.suspicion = 42;
    game.cueTokens = 3;
    game.coins = 2;
    // The objective stays visible in the shot: a readable objective
    // is part of the cover.
    game.objectiveTaken = false;
    setScreen(game, 'playing');
  } else if (name === 'act1') {
    loadLevel(game, 0);
    game.pages = 1;
    game.actPages = 1;
    game.score = 250;
    game.strikes = 3;
    game.heat = 0;
    game.levelTime = 18;
    game.suspicion = 12;
    game.cueTokens = 4;
    game.coins = 2;
    game.objectiveTaken = false;
    setScreen(game, 'playing');
  } else if (name === 'act2complete') {
    loadLevel(game, 1);
    game.completedActs = [true, true, false, false, false];
    game.pages = 2;
    game.actPages = 1;
    game.score = 2600;
    game.strikes = 2;
    game.heat = 25;
    game.actTimes[1] = 96;
    game.lastCompletedAct = 1;
    game.levelTime = 96;
    game.objectiveTaken = true;
    setScreen(game, 'playing');
    pushScreen(game, 'intermission');
  } else if (name === 'act5') {
    loadLevel(game, 4);
    game.completedActs = [true, true, true, true, true];
    game.pages = 5;
    game.actPages = 1;
    game.score = 9150;
    game.strikes = 1;
    game.heat = 60;
    game.totalTime = 612;
    game.levelTime = 0;
    game.objectiveTaken = true;
    setScreen(game, 'playing');
    pushScreen(game, 'victory');
  } else {
    setScreen(game, 'title');
    return;
  }
  // Showcase states are mid-act, long past the act start, so the
  // act-start banner must not linger in the shot.
  game.message = '';
  game.messageT = 0;
  // Deterministic guard and device state for the shot.
  for (const g of game.guards) {
    const start = tileCenter(game.level.guards[game.guards.indexOf(g)].waypoints[0][0], game.level.guards[game.guards.indexOf(g)].waypoints[0][1]);
    g.x = start.x;
    g.y = start.y;
    g.dir = Math.PI / 2;
  }
  for (const cam of game.cameras) cam.phase = 0;
  for (const laser of game.lasers) laser.t = 0;
  game.time = game.levelTime;
  game.lux = playerLux(game);
}

// --- The per-frame update. ---

function updateStatus(game) {
  const worst = worstSuspicion(game);
  let sees = false;
  for (const g of game.guards) {
    if (g.seesPlayer) { sees = true; break; }
  }
  if (sees) game.status = game.lux >= 0.5 ? 'IN THE LIGHT' : 'MARKED';
  else if (worst > 30) game.status = 'MARKED';
  else game.status = 'UNSEEN';
}

function update(game, dt) {
  if (game.state !== 'playing') return;
  game.time += dt;
  game.levelTime += dt;
  // The Show Clock: a new scene every 45 seconds. A storm act strobes.
  const scene = Math.floor(game.levelTime / SCENE_LEN) % 3;
  if (scene !== game.sceneIndex) {
    game.sceneIndex = scene;
    if (game.level.gel === 'storm') game.strobe = 1;
  }
  if (game.strobe > 0) game.strobe = Math.max(0, game.strobe - dt * 2);
  if (game.messageT > 0) game.messageT -= dt;
  if (game.coinLure) {
    game.coinLure.t -= dt;
    if (game.coinLure.t <= 0) game.coinLure = null;
  }
  for (let i = game.coinsThrown.length - 1; i >= 0; i--) {
    game.coinsThrown[i].t -= dt;
    if (game.coinsThrown[i].t <= 0) game.coinsThrown.splice(i, 1);
  }
  updateCues(game, dt);
  updatePlayer(game, dt, game.input);
  if (game.state !== 'playing') return;
  updateGuards(game, dt);
  if (game.state !== 'playing') return;
  updateCameras(game, dt);
  if (game.state !== 'playing') return;
  updateLasers(game, dt);
  if (game.state !== 'playing') return;
  game.lux = playerLux(game);
  updateStatus(game);
}

// --- Input: screen transitions and cues. Called once per frame. ---

function handleInput(game) {
  const input = game.input;
  if (game.state === 'title') {
    if (input.hit('Enter')) {
      game.sound.unlock();
      game.sound.click();
      startGame(game);
    }
    return;
  }
  if (game.state === 'playing') {
    if (input.hit('Escape')) {
      pushScreen(game, 'paused');
      return;
    }
    if (input.hit('KeyR')) {
      retryAct(game);
      return;
    }
    for (const cue of ['1', '2', '3', '4']) {
      if (input.hit('Digit' + cue)) {
        const c = cueByKey(cue);
        if (c) fireCue(game, c.id);
        return;
      }
    }
    return;
  }
  if (game.state === 'paused') {
    if (input.hit('Escape')) {
      popScreen(game);
      return;
    }
    if (input.hit('KeyR')) {
      retryAct(game);
      return;
    }
    return;
  }
  if (game.state === 'intermission') {
    if (input.hit('Enter')) {
      game.sound.click();
      nextLevel(game);
    }
    return;
  }
  if (game.state === 'strikeLost') {
    if (input.hit('Enter') || input.hit('Escape')) {
      game.sound.click();
      retryActAfterStrike(game);
    }
    return;
  }
  if (game.state === 'victory') {
    if (input.hit('Enter')) {
      game.sound.click();
      startGame(game);
    }
    return;
  }
  if (game.state === 'gameOver') {
    if (input.hit('Enter') || input.hit('KeyR')) {
      game.sound.click();
      startGame(game);
    }
    return;
  }
}

// --- Boot. ---

export function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const game = createGame();
  addMethods(game);
  game.actSummary = () => actSummary(game);
  game.view = createView();
  game.input = createInput(canvas);
  game.input.attach();
  const params = new URLSearchParams(location.search);
  const showcase = params.get('showcase');
  if (showcase) {
    applyShowcase(game, showcase);
  } else {
    setScreen(game, 'title');
  }
  let last = 0;
  let acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const now = t / 1000;
    if (!last) last = now;
    const dt = Math.min(0.1, now - last);
    last = now;
    handleInput(game);
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) {
      update(game, STEP);
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    draw(game, ctx);
    game.input.endFrame();
  }
  requestAnimationFrame(frame);
  // Expose the game for debugging and for the play-test driver.
  window.__game = game;
  return game;
}

// Fit the view rect to the canvas. The playfield leaves room for the
// CAMPAIGN panel on the left (x 16..216) and the right panel (x 992..).
// The rect is left 232, top 80, right 984, bottom 704; the world is
// centered inside it by createView.
export function fitView() {
  return createView();
}

boot();
