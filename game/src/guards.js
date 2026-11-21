// Guard AI for PROMPT SIDE: patrol, suspicion, alert, chase, return.
// Guards are stagehands, dressers and the Stage Manager, patrolling on cue.
// A guard must watch the player for a short time before going fully alert,
// so the player always has a chance to slip back into shadow.

import { TILE, hasLineOfSight, lightAt } from './levels.js';

export const CONE_RANGE = 175;
export const CONE_HALF_ANGLE = 0.61; // about 35 degrees each side
export const CATCH_DIST = 26;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function makeGuard(def, grid) {
  const start = def.waypoints[0];
  const px = (start[0] + 0.5) * TILE;
  const py = (start[1] + 0.5) * TILE;
  const next = def.waypoints[1] || start;
  const nx = (next[0] + 0.5) * TILE;
  const ny = (next[1] + 0.5) * TILE;
  return {
    x: px,
    y: py,
    angle: Math.atan2(ny - py, nx - px),
    speed: def.speed || 60,
    waypoints: def.waypoints.map((w) => ({ x: (w[0] + 0.5) * TILE, y: (w[1] + 0.5) * TILE })),
    wpIndex: 1 % def.waypoints.length,
    state: 'PATROL',
    detect: 0,
    lastSeen: { x: px, y: py },
    loseTimer: 0,
    pauseTimer: 0,
    stepTimer: 0,
    stunned: 0,
    kind: def.kind || 'stagehand',
  };
}

export function makeCamera(def) {
  return {
    x: (def.tx + 0.5) * TILE,
    y: (def.ty + 0.5) * TILE,
    baseAngle: def.baseAngle,
    sweep: def.sweep,
    speed: def.speed,
    range: def.range,
    angle: def.baseAngle,
    sweepT: Math.random() * Math.PI * 2,
    detect: 0,
    cooldown: 0,
  };
}

// Effective cone range right now: blackout collapses it, fog shortens it.
export function coneRange(game) {
  let r = CONE_RANGE;
  if (game.cues.blackout > 0) r = 34;
  else if (game.cues.fog > 0) r = CONE_RANGE * 0.6;
  return r;
}

// Can this guard see the player right now? Returns a visibility factor 0..1.
export function guardSeesPlayer(game, guard) {
  const p = game.player;
  if (p.inVent) return 0;
  const dx = p.x - guard.x;
  const dy = p.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const range = coneRange(game);
  if (dist > range) return 0;
  if (game.cues.blackout > 0 && dist > 40) return 0;
  const toPlayer = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(toPlayer, guard.angle)) > CONE_HALF_ANGLE) return 0;
  if (!hasLineOfSight(game.grid, guard.x, guard.y, p.x, p.y)) return 0;
  // Crouched in low cover: invisible unless the guard is almost on top of you.
  if (p.hidden && dist > 46) return 0;
  return 1 - dist / range;
}

// How fast the detection meter fills when the player is seen.
// Light matters: shadow slows it, lamp light speeds it, a followspot beam
// during fog makes the player stand out, sprinting is easier to spot.
export function detectionRate(game, guard, visibility) {
  const light = game.playerLight;
  let rate = 1.15 * (0.35 + visibility);
  rate *= 0.45 + light * 1.25;
  if (game.player.sneaking) rate *= 0.7;
  if (game.player.sprinting) rate *= 1.35;
  if (game.cues.fog > 0 && light > 0.6) rate *= 1.5;
  if (game.cues.blackout > 0) rate *= 0.5;
  return rate;
}

function moveToward(guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  guard.angle = Math.atan2(dy, dx);
  return dist - step < 2;
}

function turnToward(guard, targetAngle, dt, turnSpeed) {
  const d = angleDiff(targetAngle, guard.angle);
  const maxTurn = turnSpeed * dt;
  guard.angle += Math.max(-maxTurn, Math.min(maxTurn, d));
}

export function updateGuard(game, guard, dt) {
  const p = game.player;
  if (guard.stunned > 0) {
    guard.stunned -= dt;
    return;
  }
  const sceneBoost = 1 + game.cues.scene * 0.05;
  const seen = guardSeesPlayer(game, guard);

  if (seen > 0) {
    guard.detect += detectionRate(game, guard, seen) * dt;
    guard.lastSeen = { x: p.x, y: p.y };
    guard.loseTimer = 0;
    if (guard.detect >= 0.5 && guard.state === 'PATROL') {
      guard.state = 'SUSPICIOUS';
      game.onSpotted('seen');
    }
    if (guard.detect >= 1) {
      if (guard.state !== 'ALERT') {
        guard.state = 'ALERT';
        game.onSpotted('chase');
        game.audio.alarm();
      }
    }
  } else {
    guard.detect = Math.max(0, guard.detect - dt * 0.35);
    if (guard.state === 'ALERT') {
      guard.loseTimer += dt;
      if (guard.loseTimer > 4) {
        guard.state = 'SUSPICIOUS';
        guard.loseTimer = 0;
      }
    }
  }

  if (guard.state === 'PATROL') {
    if (guard.pauseTimer > 0) {
      guard.pauseTimer -= dt;
      const target = guard.waypoints[guard.wpIndex];
      turnToward(guard, Math.atan2(target.y - guard.y, target.x - guard.x), dt, 2.5);
    } else {
      const target = guard.waypoints[guard.wpIndex];
      const arrived = moveToward(guard, target.x, target.y, guard.speed * sceneBoost, dt);
      if (arrived) {
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
        guard.pauseTimer = 0.7;
      }
    }
  } else if (guard.state === 'SUSPICIOUS') {
    const arrived = moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, guard.speed * 1.25 * sceneBoost, dt);
    if (arrived) {
      turnToward(guard, guard.angle + Math.PI * 2 * dt * 0.4, dt, 3);
      guard.pauseTimer += dt;
      if (guard.pauseTimer > 3.5) {
        guard.state = 'PATROL';
        guard.detect = 0;
        guard.pauseTimer = 0;
      }
    }
  } else if (guard.state === 'ALERT') {
    moveToward(guard, p.x, p.y, guard.speed * 1.75 * sceneBoost, dt);
    const d = Math.hypot(p.x - guard.x, p.y - guard.y);
    if (d < CATCH_DIST) game.onCaught(guard);
  }

  // Footstep ticks, louder as the guard nears the player.
  guard.stepTimer -= dt;
  const moving = guard.state !== 'PATROL' || guard.pauseTimer <= 0;
  if (moving && guard.stepTimer <= 0) {
    guard.stepTimer = guard.state === 'ALERT' ? 0.32 : 0.55;
    const d = Math.hypot(p.x - guard.x, p.y - guard.y);
    game.audio.footstep(d);
  }
}

// Cameras sweep a cone. Being watched by a camera fills its own meter;
// a full meter raises House Suspicion and sends the nearest guard to look.
export function updateCamera(game, cam, dt) {
  cam.sweepT += dt * cam.speed;
  cam.angle = cam.baseAngle + Math.sin(cam.sweepT) * cam.sweep;
  cam.cooldown = Math.max(0, cam.cooldown - dt);
  const p = game.player;
  if (p.inVent) {
    cam.detect = Math.max(0, cam.detect - dt * 0.5);
    return;
  }
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dist = Math.hypot(dx, dy);
  let seen = false;
  if (dist < cam.range && game.cues.blackout <= 0) {
    const toPlayer = Math.atan2(dy, dx);
    if (Math.abs(angleDiff(toPlayer, cam.angle)) < 0.5) {
      if (hasLineOfSight(game.grid, cam.x, cam.y, p.x, p.y)) {
        if (!(p.hidden && dist > 46)) seen = true;
      }
    }
  }
  if (seen) {
    cam.detect += dt * (0.8 + game.playerLight);
    if (cam.detect >= 1 && cam.cooldown <= 0) {
      cam.detect = 0;
      cam.cooldown = 6;
      game.cues.suspicion = Math.min(100, game.cues.suspicion + 20);
      game.setMessage('An usher lantern spotted you. House Suspicion rises.');
      game.audio.alarm();
      let nearest = null;
      let best = Infinity;
      for (const g of game.guards) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < best) { best = d; nearest = g; }
      }
      if (nearest) {
        nearest.state = 'SUSPICIOUS';
        nearest.detect = 0.6;
        nearest.lastSeen = { x: p.x, y: p.y };
      }
      game.onTrip('camera');
    }
  } else {
    cam.detect = Math.max(0, cam.detect - dt * 0.4);
  }
}

// Lasers pulse on a timer. Crossing a live beam trips the rigging alarm.
export function laserActive(laser, time) {
  const phase = (time + laser.phase) % laser.period;
  return phase < laser.period * 0.55;
}

export function updateLasers(game, dt) {
  const p = game.player;
  if (p.inVent) return;
  for (const laser of game.lasers) {
    if (!laserActive(laser, game.time) || laser.cooldown > 0) {
      laser.cooldown = Math.max(0, (laser.cooldown || 0) - dt);
      continue;
    }
    const x1 = laser.x1 * TILE;
    const y1 = laser.y1 * TILE;
    const x2 = laser.x2 * TILE;
    const y2 = laser.y2 * TILE;
    const d = pointToSegmentDist(p.x, p.y, x1, y1, x2, y2);
    if (d < 14) {
      laser.cooldown = 4;
      game.cues.suspicion = Math.min(100, game.cues.suspicion + 20);
      game.setMessage('You crossed a rigging safety line. House Suspicion rises.');
      game.audio.alarm();
      for (const g of game.guards) {
        const gd = Math.hypot(g.x - p.x, g.y - p.y);
        if (gd < 320) {
          g.state = 'SUSPICIOUS';
          g.detect = 0.6;
          g.lastSeen = { x: p.x, y: p.y };
        }
      }
      game.onTrip('laser');
    }
  }
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Recompute the player's light level and hidden state each frame.
export function updatePlayerLight(game) {
  game.playerLight = lightAt(game.grid, game.lamps, game.player.x, game.player.y);
  const p = game.player;
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  const tile = game.grid[ty] ? game.grid[ty][tx] : '#';
  p.hidden = p.sneaking && (tile === 'l' || tile === ',');
  p.inLight = game.playerLight > 0.6;
}
