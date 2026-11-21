// Player movement, noise, coins, hiding, vents, desks and objective pickup.

import { TILE, tileAt, solidAtPixel, findTile, findAllTiles } from './levels.js';

export function makePlayer(start) {
  return {
    x: (start.tx + 0.5) * TILE,
    y: (start.ty + 0.5) * TILE,
    dir: 0,
    sneaking: false,
    sprinting: false,
    moving: false,
    noise: 0,
    coins: 5,
    hidden: false,
    inLight: false,
    inVent: false,
    hasObjective: false,
    ventCooldown: 0,
    stepTimer: 0,
  };
}

// Move with simple axis separated AABB collision so the player slides along
// walls. The simulation runs on a fixed 1/60s step and the fastest speed is
// 215 px/s, so one step moves at most 3.6px, far less than the player radius
// and the 32px tile size, so nothing can tunnel through a wall.
function tryMove(game, p, dx, dy) {
  const r = 11;
  const nx = p.x + dx;
  if (!solidAtPixel(game.grid, nx + Math.sign(dx) * r, p.y - r + 2) &&
      !solidAtPixel(game.grid, nx + Math.sign(dx) * r, p.y + r - 2) &&
      !solidAtPixel(game.grid, nx + Math.sign(dx) * r, p.y)) {
    p.x = nx;
  }
  const ny = p.y + dy;
  if (!solidAtPixel(game.grid, p.x - r + 2, ny + Math.sign(dy) * r) &&
      !solidAtPixel(game.grid, p.x + r - 2, ny + Math.sign(dy) * r) &&
      !solidAtPixel(game.grid, p.x, ny + Math.sign(dy) * r)) {
    p.y = ny;
  }
}

export function updatePlayer(game, dt) {
  const p = game.player;
  const input = game.input;
  p.ventCooldown = Math.max(0, p.ventCooldown - dt);

  let mx = 0;
  let my = 0;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  p.sneaking = input.sneak && !input.sprint;
  p.sprinting = input.sprint && len > 0 && !p.sneaking;

  let speed = 132;
  if (p.sneaking) speed = 66;
  if (p.sprinting) speed = 215;

  if (len > 0) {
    mx /= len;
    my /= len;
    p.dir = Math.atan2(my, mx);
    tryMove(game, p, mx * speed * dt, my * speed * dt);
    // Footstep sounds for the player, quiet when sneaking.
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = p.sprinting ? 0.26 : p.sneaking ? 0.6 : 0.42;
      if (!p.sneaking) game.audio.playerStep(p.sprinting);
    }
  }

  // Noise radius: sneaking is silent, walking is a whisper, sprinting is loud.
  // Thunder Sheet applause masks all of it.
  if (game.cues.thunder > 0) {
    p.noise = 0;
  } else if (p.sprinting && p.moving) {
    p.noise = 150;
  } else if (p.moving && !p.sneaking) {
    p.noise = 46;
  } else {
    p.noise = 0;
  }

  // Loud movement draws nearby guards to investigate.
  if (p.noise >= 150) {
    for (const g of game.guards) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < 230 && g.state === 'PATROL') {
        g.state = 'SUSPICIOUS';
        g.detect = Math.max(g.detect, 0.55);
        g.lastSeen = { x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 60 };
      }
    }
  }

  // Coin decoys: thrown coins clink and pull guards to the landing point.
  for (const coin of game.coinsThrown) {
    coin.life -= dt;
    if (coin.life > 0) {
      for (const g of game.guards) {
        const d = Math.hypot(g.x - coin.x, g.y - coin.y);
        if (d < 260 && g.state === 'PATROL') {
          g.state = 'SUSPICIOUS';
          g.detect = Math.max(g.detect, 0.55);
          g.lastSeen = { x: coin.x, y: coin.y };
        }
      }
    }
  }
  game.coinsThrown = game.coinsThrown.filter((c) => c.life > 0);

  // Objective pickup: stand on it and press E.
  const obj = game.objective;
  if (obj && !obj.taken) {
    const d = Math.hypot(p.x - obj.x, p.y - obj.y);
    obj.near = d < 34;
    if (obj.near && input.consumeInteract()) {
      obj.taken = true;
      p.hasObjective = true;
      game.onPagePickup();
    }
  }

  // Exit: only opens once the objective is stolen.
  const exit = game.exit;
  if (exit && p.hasObjective) {
    const d = Math.hypot(p.x - exit.x, p.y - exit.y);
    if (d < 30) game.onLevelComplete();
  }

  // Vents: press E near a vent to crawl to its pair.
  if (p.ventCooldown <= 0) {
    for (const vent of game.vents) {
      const d = Math.hypot(p.x - vent.x, p.y - vent.y);
      if (d < 34 && input.consumeInteract()) {
        const other = game.vents.find((v) => v !== vent);
        if (other) {
          p.x = other.x;
          p.y = other.y;
          p.inVent = true;
          p.ventCooldown = 1.2;
          game.audio.vent();
          game.setMessage('You crawl through the trapdoor vent.');
          setTimeout(() => { p.inVent = false; }, 600);
        }
        break;
      }
    }
  }

  // Cue desks: press E to refill one Cue token.
  for (const desk of game.desks) {
    const d = Math.hypot(p.x - desk.x, p.y - desk.y);
    desk.near = d < 36;
    if (desk.near && !desk.used && input.consumeInteract()) {
      desk.used = true;
      game.cues.tokens = Math.min(6, game.cues.tokens + 1);
      game.audio.pickup();
      game.setMessage('Cue desk restocked. One Cue token added.');
      if (game.emitHud) game.emitHud();
    }
  }
}

// Throw a coin toward a pixel point. Limited coins per level.
export function throwCoin(game, x, y) {
  const p = game.player;
  if (game.state !== 'playing' || p.coins <= 0) return;
  p.coins -= 1;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const ch = tileAt(game.grid, tx, ty);
  const cx = (ch === '#' || ch === 'T') ? p.x : x;
  const cy = (ch === '#' || ch === 'T') ? p.y : y;
  game.coinsThrown.push({ x: cx, y: cy, life: 3 });
  game.audio.coin();
  if (game.emitHud) game.emitHud();
}

// Tile helpers used by main.js when a level loads.
export function levelEntities(grid) {
  const start = findTile(grid, 'P');
  const objectiveTile = findTile(grid, 'O');
  const exitTile = findTile(grid, 'X');
  const lamps = findAllTiles(grid, 'L').map((t) => ({
    x: (t.tx + 0.5) * TILE,
    y: (t.ty + 0.5) * TILE,
  }));
  return {
    start,
    objective: objectiveTile
      ? { x: (objectiveTile.tx + 0.5) * TILE, y: (objectiveTile.ty + 0.5) * TILE, taken: false, near: false }
      : null,
    exit: exitTile
      ? { x: (exitTile.tx + 0.5) * TILE, y: (exitTile.ty + 0.5) * TILE }
      : null,
    lamps,
  };
}
