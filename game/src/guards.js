// PROMPT SIDE: guards, cameras and lasers. One file, one job: the eyes
// of the house. Guards patrol waypoints, grow suspicious when they see
// or hear the player, chase, and catch. Cameras sweep a cone and trip
// the house. Lasers pulse on and off and trip the house when crossed.
// This file never draws anything and never decides the campaign; it
// reports catches and trips to the game object (game.onCaught,
// game.onTrip) and main.js owns the consequences.

import { TILE, tileCenter, blocksSight, blocksMove, isLamp, isShadow } from './levels.js';
import { guardsFrozen, guardBlinded, coneRangeFactor, applauseMask } from './cues.js';

const HALF_CONE = (35 * Math.PI) / 180;
const CATCH_DIST = 26;
const HEAR_RADIUS = 220;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// True when no wall or tall crate stands between the two points.
export function lineOfSight(game, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x1 + dx * t) / TILE);
    const ty = Math.floor((y1 + dy * t) / TILE);
    if (blocksSight(game.level, tx, ty)) return false;
  }
  return true;
}

// How lit the player is, 0 to 1. Lamps raise it, deep shadow lowers it,
// blackout drops it to a pinprick, fog makes the silhouette stand out.
export function playerLux(game) {
  const p = game.player;
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  let lux = 0.3;
  if (isShadow(game.level, tx, ty)) lux -= 0.25;
  for (const lamp of game.lamps) {
    const c = tileCenter(lamp.x, lamp.y);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < 3 * TILE) lux += 0.45 * (1 - d / (3 * TILE));
  }
  if (game.cueFx.blackout > 0) lux = Math.min(lux, 0.15);
  if (game.cueFx.fog > 0) lux += 0.25;
  return Math.max(0, Math.min(1, lux));
}

export function createGuards(level) {
  return level.guards.map((g) => {
    const start = tileCenter(g.waypoints[0][0], g.waypoints[0][1]);
    return {
      name: g.name,
      x: start.x,
      y: start.y,
      dir: 0,
      speed: g.speed * TILE,
      waypoints: g.waypoints.map(([wx, wy]) => tileCenter(wx, wy)),
      wpIndex: 1 % g.waypoints.length,
      state: 'patrol',
      suspicion: 0,
      seesPlayer: false,
      color: g.color,
      coneTiles: g.cone,
      investigate: null,
      waitT: 0,
    };
  });
}

export function createCameras(level) {
  return level.cameras.map((c) => {
    const pos = tileCenter(c.x, c.y);
    return {
      x: pos.x,
      y: pos.y,
      baseDir: (c.dir * Math.PI) / 180,
      dir: (c.dir * Math.PI) / 180,
      sweep: (c.sweep * Math.PI) / 180,
      range: c.range * TILE,
      color: c.color,
      meter: 0,
      phase: Math.random() * Math.PI * 2,
    };
  });
}

export function createLasers(level) {
  return level.lasers.map((l) => {
    const a = tileCenter(l.x1, l.y1);
    const b = tileCenter(l.x2, l.y2);
    return {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      period: l.period,
      t: Math.random() * l.period,
      disabled: 0,
    };
  });
}

// Can this guard see the player right now?
export function guardSeesPlayer(game, guard) {
  if (guardBlinded(game, guard)) return false;
  const p = game.player;
  const dx = p.x - guard.x;
  const dy = p.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const range = guard.coneTiles * TILE * coneRangeFactor(game);
  if (dist > range) return false;
  const half = guard.state === 'chase' ? HALF_CONE * 1.4 : HALF_CONE;
  const ang = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(ang, guard.dir)) > half) return false;
  if (!lineOfSight(game, guard.x, guard.y, p.x, p.y)) return false;
  // A sneaking player in deep shadow is hard to spot at range.
  const lux = game.lux;
  const hidden = p.sneaking && lux < 0.25;
  if (hidden && dist > range * 0.45) return false;
  if (lux < 0.12 && dist > range * 0.3) return false;
  return true;
}

// Move with axis-separated collision so a guard slides along walls.
function moveWithCollision(game, obj, dx, dy) {
  const r = 11;
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

function moveToward(game, obj, tx, ty, speed, dt) {
  const dx = tx - obj.x;
  const dy = ty - obj.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return true;
  const step = Math.min(d, speed * dt);
  moveWithCollision(game, obj, (dx / d) * step, (dy / d) * step);
  obj.dir = Math.atan2(dy, dx);
  return d <= step + 1;
}

export function updateGuards(game, dt) {
  const frozen = guardsFrozen(game);
  const p = game.player;
  for (const g of game.guards) {
    if (frozen) {
      g.seesPlayer = false;
      continue;
    }
    if (guardBlinded(game, g)) {
      g.seesPlayer = false;
      g.suspicion = Math.max(0, g.suspicion - 30 * dt);
      continue;
    }
    const sees = guardSeesPlayer(game, g);
    g.seesPlayer = sees;
    if (sees) {
      g.suspicion = Math.min(100, g.suspicion + 55 * dt);
      g.lastSeen = { x: p.x, y: p.y };
      if (g.suspicion >= 100 && g.state !== 'chase') {
        g.state = 'chase';
        game.sound.sting();
        game.setMessage(g.name + ' spotted you!');
      }
    } else {
      g.suspicion = Math.max(0, g.suspicion - 12 * dt);
      if (g.state === 'chase' && g.suspicion <= 0) g.state = 'suspicious';
      else if (g.state === 'suspicious' && g.suspicion <= 0) g.state = 'patrol';
    }

    // Hearing: loud steps and coin clinks draw a guard's attention.
    const noise = p.noise * (1 - applauseMask(game));
    const nd = Math.hypot(p.x - g.x, p.y - g.y);
    if (noise > 0.15 && nd < HEAR_RADIUS * noise && g.state === 'patrol') {
      g.state = 'investigate';
      g.investigate = { x: p.x, y: p.y };
    }
    if (game.coinLure && g.state === 'patrol') {
      const cd = Math.hypot(game.coinLure.x - g.x, game.coinLure.y - g.y);
      if (cd < 260) {
        g.state = 'investigate';
        g.investigate = { x: game.coinLure.x, y: game.coinLure.y };
      }
    }

    // Movement by state.
    if (g.state === 'patrol') {
      const target = g.waypoints[g.wpIndex];
      if (moveToward(game, g, target.x, target.y, g.speed, dt)) {
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
      }
    } else if (g.state === 'chase') {
      moveToward(game, g, p.x, p.y, g.speed * 1.55, dt);
    } else if (g.state === 'investigate' && g.investigate) {
      if (moveToward(game, g, g.investigate.x, g.investigate.y, g.speed * 1.2, dt)) {
        g.waitT += dt;
        if (g.waitT > 1.2) {
          g.state = 'patrol';
          g.investigate = null;
          g.waitT = 0;
        }
      }
    } else if (g.state === 'suspicious' && g.lastSeen) {
      moveToward(game, g, g.lastSeen.x, g.lastSeen.y, g.speed * 0.8, dt);
    }

    // Catch: close enough and not frozen or blinded.
    const cd = Math.hypot(p.x - g.x, p.y - g.y);
    if (cd < CATCH_DIST) {
      game.onCaught();
      return;
    }
  }
}

export function updateCameras(game, dt) {
  const p = game.player;
  for (const cam of game.cameras) {
    cam.phase += dt * 0.5;
    cam.dir = cam.baseDir + Math.sin(cam.phase) * (cam.sweep / 2);
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dist = Math.hypot(dx, dy);
    let seen = false;
    if (dist < cam.range && game.cueFx.blackout <= 0) {
      const ang = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(ang, cam.dir)) < (25 * Math.PI) / 180) {
        if (lineOfSight(game, cam.x, cam.y, p.x, p.y)) seen = true;
      }
    }
    if (seen) {
      cam.meter = Math.min(100, cam.meter + 45 * dt);
      if (cam.meter >= 100) {
        cam.meter = 0;
        game.addSuspicion(20);
        game.onTrip('camera');
      }
    } else {
      cam.meter = Math.max(0, cam.meter - 25 * dt);
    }
  }
}

export function updateLasers(game, dt) {
  const p = game.player;
  for (const laser of game.lasers) {
    if (laser.disabled > 0) {
      laser.disabled -= dt;
      continue;
    }
    laser.t += dt;
    const on = (laser.t % laser.period) < laser.period * 0.55;
    if (!on) continue;
    const d = distToSegment(p.x, p.y, laser.x1, laser.y1, laser.x2, laser.y2);
    if (d < 14) {
      laser.disabled = 3;
      game.addSuspicion(20);
      game.onTrip('laser');
    }
  }
}

// The worst guard suspicion, for the HUD status line.
export function worstSuspicion(game) {
  let w = 0;
  for (const g of game.guards) w = Math.max(w, g.suspicion);
  return w;
}
