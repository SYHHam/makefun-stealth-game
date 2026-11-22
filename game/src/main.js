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
    // Telemetry only, never gameplay: a position log for the Curtain
    // Call route map, and counters for the debrief stats.
    routeLog: [],
    routeLogT: 0,
    coinsThrownTotal: 0,
    closeCalls: 0,
    // Render-only staging: callouts and the live FIELD NOTES row for
    // the current screenshot. A showcase sets these; live play leaves
    // them unset and the render derives them from state.
    callouts: null,
    fieldNotesRow: null,
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
  // The route log is per act, so the Curtain Call map draws the
  // route through the final act only.
  game.routeLog = [];
  game.routeLogT = 0;
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
  // Clear any staging from a previous showcase.
  game.callouts = null;
  game.fieldNotesRow = null;
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
    game.fieldNotesRow = 2;
    // Five annotated callouts, clockwise from top-left. Plates sit in
    // the dark top and bottom margins of the playfield.
    const lamp = tileCenter(9, 2);
    const obj = tileCenter(game.level.objective.x, game.level.objective.y);
    const exit = tileCenter(game.level.exit.x, game.level.exit.y);
    const spawn = tileCenter(2, 13);
    game.callouts = [
      { anchor: lamp, plate: [252, 88, 260], label: 'FOOTLIGHT', sentence: 'Lit boards, seen from across the house.' },
      { anchor: spawn, plate: [232, 648, 220], label: 'YOU', sentence: 'The understudy. In shadow, unseen.' },
      { anchor: obj, plate: [700, 88, 280], label: 'THE SCORE', sentence: 'The Composer\u2019s score, left unguarded.' },
      { anchor: exit, plate: [740, 648, 240], label: 'STAGE DOOR', sentence: 'Opens once you hold the score.' },
      { anchor: { x: 996, y: 190 }, screen: true, plate: [483, 648, 240], label: 'CUE BOARD', sentence: 'Four cues. Each one changes the room.', elbow: 'v' },
    ];
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
  } else if (name === 'coin') {
    // S2 "The Coin & The Cue": Act 1, a coin just thrown, the nearest
    // guard turning toward it, and FOG DRUM mid-call.
    loadLevel(game, 0);
    game.pages = 1;
    game.actPages = 1;
    game.score = 250;
    game.strikes = 3;
    game.heat = 5;
    game.levelTime = 34;
    game.suspicion = 18;
    game.cueTokens = 3;
    game.coins = 1;
    game.objectiveTaken = false;
    // The player near the spawn, the coin ahead on the boards.
    const p = tileCenter(4, 11);
    game.player.x = p.x;
    game.player.y = p.y;
    game.player.dir = Math.PI / 4;
    const coin = tileCenter(9, 8);
    game.coinLure = { x: coin.x, y: coin.y, t: 4 };
    game.coinsThrown = [{ x: coin.x, y: coin.y, t: 0.6 }];
    // The nearest guard turns toward the coin.
    const g = game.guards[0];
    g.state = 'investigate';
    g.investigate = { x: coin.x, y: coin.y };
    g.dir = Math.atan2(coin.y - g.y, coin.x - g.x);
    g.suspicion = 25;
    // FOG DRUM mid-call.
    game.cueFx.fog = 6;
    game.fieldNotesRow = 5;
    game.callouts = [
      { anchor: coin, plate: [252, 88, 240], label: 'COIN', sentence: 'Pulls a guard off their mark.' },
      { anchor: { x: g.x, y: g.y }, plate: [745, 648, 260], label: 'GUARD', sentence: 'He heard it. Off to look.' },
      { anchor: { x: 996, y: 190 }, screen: true, plate: [483, 648, 240], label: 'CUE BOARD', sentence: 'Fog Drum is running. Cones shrink.', elbow: 'v' },
    ];
    setScreen(game, 'playing');
  } else if (name === 'spotted') {
    // S3 "SPOTTED": Act 1, a guard in chase with the player inside
    // the red cone, ALARM on the DETECTION panel.
    loadLevel(game, 0);
    game.pages = 1;
    game.actPages = 1;
    game.score = 250;
    game.strikes = 3;
    game.heat = 20;
    game.levelTime = 52;
    game.suspicion = 68;
    game.cueTokens = 4;
    game.coins = 2;
    game.objectiveTaken = false;
    // The player caught in the open, lit, inside the guard cone.
    const p = tileCenter(10, 6);
    game.player.x = p.x;
    game.player.y = p.y;
    game.player.dir = Math.PI;
    // The nearest guard chasing the player, far enough that it cannot
    // reach the player before the shot is taken. Speed 0 freezes the
    // chase in place: the cone stays on the player, the guard does
    // not close the distance during the showcase wait.
    const g0 = game.guards[0];
    g0.state = 'chase';
    g0.suspicion = 100;
    g0.seesPlayer = true;
    g0.speed = 0;
    const gp = tileCenter(7, 3);
    g0.x = gp.x;
    g0.y = gp.y;
    g0.dir = Math.atan2(p.y - gp.y, p.x - gp.x);
    // A second guard converging from the other side.
    const g1 = game.guards[1];
    g1.state = 'chase';
    g1.suspicion = 85;
    g1.seesPlayer = true;
    g1.speed = 0;
    const gp1 = tileCenter(14, 10);
    g1.x = gp1.x;
    g1.y = gp1.y;
    g1.dir = Math.atan2(p.y - gp1.y, p.x - gp1.x);
    game.fieldNotesRow = 4;
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
    // Staged debrief numbers: a clean ghost run.
    game.spotted = 0;
    game.closeCalls = 0;
    game.coinsThrownTotal = 2;
    // A synthetic route for the debrief map: spawn, around the wings,
    // to the score, then out the door. Tile coords on Act 5.
    const routeTiles = [
      [2, 13], [4, 13], [5, 11], [5, 8], [8, 8], [10, 6], [12, 4],
      [15, 3], [18, 2], [20, 2], [20, 5], [18, 8], [19, 10], [21, 11], [21, 13],
    ];
    game.routeLog = routeTiles.map(([tx, ty]) => {
      const c = tileCenter(tx, ty);
      return { x: c.x, y: c.y };
    });
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
  // Route telemetry: log the player position every quarter second,
  // capped so a long run cannot grow the log without bound.
  game.routeLogT += dt;
  if (game.routeLogT >= 0.25) {
    game.routeLogT = 0;
    if (game.routeLog.length < 3000) {
      game.routeLog.push({ x: game.player.x, y: game.player.y });
    }
  }
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
