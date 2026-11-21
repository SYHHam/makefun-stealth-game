// PROMPT SIDE: the player. One file, one job: the understudy. Movement,
// noise, hiding, coin throws, page pickups, vents and the exit. It never
// draws anything and never owns the campaign; it calls the game hooks
// (game.onPagePickup, game.onLevelComplete) and main.js owns the rest.

import { TILE, tileCenter, blocksMove, isCover } from './levels.js';

const WALK_SPEED = 140;
const SNEAK_SPEED = 70;
const SPRINT_SPEED = 220;
const PLAYER_R = 11;

export function createPlayer(spawn) {
  const pos = tileCenter(spawn.x, spawn.y);
  return {
    x: pos.x,
    y: pos.y,
    dir: 0,
    sneaking: false,
    sprinting: false,
    moving: false,
    noise: 0,
    stepT: 0,
    hidden: false,
  };
}

function moveWithCollision(game, obj, dx, dy) {
  const r = PLAYER_R;
  const level = game.level;
  const tryX = obj.x + dx;
  const top = Math.floor((obj.y - r) / TILE);
  const bottom = Math.floor((obj.y + r) / TILE);
  const leftX = Math.floor((tryX - r) / TILE);
  const rightX = Math.floor((tryX + r) / TILE);
  let blockedX = false;
  for (let ty = top; ty <= bottom; ty++) {
    if (blocksMove(level, leftX, ty) || blocksMove(level, rightX, ty)) blockedX = true;
  }
  if (!blockedX) obj.x = tryX;
  const tryY = obj.y + dy;
  const left = Math.floor((obj.x - r) / TILE);
  const right = Math.floor((obj.x + r) / TILE);
  const topY = Math.floor((tryY - r) / TILE);
  const bottomY = Math.floor((tryY + r) / TILE);
  let blockedY = false;
  for (let tx = left; tx <= right; tx++) {
    if (blocksMove(level, tx, topY) || blocksMove(level, tx, bottomY)) blockedY = true;
  }
  if (!blockedY) obj.y = tryY;
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  const vec = input.moveVector();
  p.sneaking = input.sneaking();
  p.sprinting = input.sprinting() && !p.sneaking;
  p.moving = vec.x !== 0 || vec.y !== 0;

  let speed = WALK_SPEED;
  let noise = 0;
  if (p.moving) {
    if (p.sneaking) {
      speed = SNEAK_SPEED;
      noise = 0.1;
    } else if (p.sprinting) {
      speed = SPRINT_SPEED;
      noise = 1.0;
    } else {
      speed = WALK_SPEED;
      noise = 0.4;
    }
    p.dir = Math.atan2(vec.y, vec.x);
    moveWithCollision(game, p, vec.x * speed * dt, vec.y * speed * dt);
    // Footsteps: a soft tap on a timer, faster when sprinting.
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = p.sprinting ? 0.28 : p.sneaking ? 0.6 : 0.42;
      game.sound.footstep(p.sprinting);
    }
  } else {
    noise = 0;
  }
  p.noise = noise;

  // Hiding: sneaking on low cover makes the player hard to spot.
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  p.hidden = p.sneaking && isCover(game.level, tx, ty);

  // Coin throw: click anywhere in the playfield to toss a coin there.
  const click = input.takeClick();
  if (click && game.state === 'playing') {
    throwCoin(game, click.x, click.y);
  }

  // Vent: press E near a vent mouth to crawl through to its pair.
  if (input.hit('KeyE')) {
    input.consume('KeyE');
    const vent = nearVent(game, p);
    if (vent) {
      const other = vent.a.x === Math.floor(p.x / TILE) && vent.a.y === Math.floor(p.y / TILE) ? vent.b : vent.a;
      const pos = tileCenter(other.x, other.y);
      p.x = pos.x;
      p.y = pos.y;
      game.setMessage('Through the vent, into the wings.');
      game.sound.click();
    }
  }

  // Objective: touch the page to pick it up.
  if (!game.objectiveTaken) {
    const o = tileCenter(game.level.objective.x, game.level.objective.y);
    if (Math.hypot(p.x - o.x, p.y - o.y) < 26) {
      game.objectiveTaken = true;
      game.onPagePickup();
    }
  }

  // Exit: touch it after the steal to finish the act.
  const ex = tileCenter(game.level.exit.x, game.level.exit.y);
  if (Math.hypot(p.x - ex.x, p.y - ex.y) < 26) {
    if (game.objectiveTaken) {
      game.onLevelComplete();
    } else {
      game.setMessage('The exit is shut. Steal the score page first.');
    }
  }
}

function nearVent(game, p) {
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  for (const v of game.level.vents) {
    const da = Math.hypot(tx - v.a.x, ty - v.a.y);
    const db = Math.hypot(tx - v.b.x, ty - v.b.y);
    if (da <= 1 || db <= 1) return v;
  }
  return null;
}

// A coin flies to the clicked point, clinks, and draws nearby guards.
// The click arrives in canvas pixels; the view converts it to world
// pixels. A click outside the playfield does nothing and spends no coin.
export function throwCoin(game, cx, cy) {
  if (game.coins <= 0) {
    game.setMessage('No coins left.');
    return;
  }
  const target = game.view ? game.view.toWorld(cx, cy) : null;
  if (!target) return;
  game.coins -= 1;
  game.coinLure = { x: target.x, y: target.y, t: 4 };
  game.coinsThrown.push({ x: target.x, y: target.y, t: 0.6 });
  game.sound.coin();
  game.setMessage('A coin clinks on the floorboards.');
}
