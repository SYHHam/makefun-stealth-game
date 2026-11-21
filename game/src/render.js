// All canvas drawing for PROMPT SIDE: floorboards, flats, lamps, vision cones
// in gel colors, guards, the cloaked player, particles, lighting, the HUD
// with its legend, and every screen (title, pause, level complete, game over).
//
// UI scaling policy: one reference resolution, 1280x720, scaled to fit with
// aspect expand. HUD corners are anchored outward to the window edges and
// critical UI (timer, detection state, objective) sits inside a 16px safe
// area inset. Font sizes scale with the UI scale so text stays readable on
// a TV as well as a laptop. Detection is never color alone: every state
// has an icon and a word label.

import { TILE, tileAt } from './levels.js';
import { coneRange, laserActive } from './guards.js';
import { CUES } from './cues.js';

const GEL = {
  amber: 'rgba(245, 166, 35, 0.30)',
  cyan: 'rgba(55, 211, 200, 0.30)',
  magenta: 'rgba(214, 51, 156, 0.30)',
};
const GEL_CORE = {
  amber: 'rgba(245, 166, 35, 0.55)',
  cyan: 'rgba(55, 211, 200, 0.55)',
  magenta: 'rgba(214, 51, 156, 0.55)',
};

// Reference resolution for the whole UI, scaled to fit, aspect expand.
const REF_W = 1280;
const REF_H = 720;
const SAFE = 16;

function uiScale(game) {
  return Math.max(0.7, Math.min(1.5, Math.min(game.canvasW / REF_W, game.canvasH / REF_H)));
}

export { uiScale };

// Side panel width, anchored to the right edge, grows with the UI scale so
// legend and control lines never clip at large scales.
export function uiPanelWidth(game) {
  return Math.min(360, Math.round(288 * uiScale(game)));
}

// Height of the top area (top bar plus goal and message lines), scaled with
// the UI scale so the world view below it never overlaps the HUD.
export function uiTopHeight(game) {
  return Math.round(112 * uiScale(game));
}

function conePath(ctx, x, y, angle, range, halfAngle) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  ctx.closePath();
}

function drawCone(ctx, x, y, angle, range, halfAngle, fill, stroke) {
  conePath(ctx, x, y, angle, range, halfAngle);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Detection wording shown in the HUD. Each state has an icon as well as a
// word, so the signal never relies on color alone.
export function detectionLabel(game) {
  let maxDetect = 0;
  for (const g of game.guards) maxDetect = Math.max(maxDetect, g.detect);
  const anyAlert = game.guards.some((g) => g.state === 'ALERT');
  if (anyAlert || maxDetect >= 1) return 'SPOTTED';
  if (maxDetect >= 0.5) return 'MARKED';
  if (game.playerLight > 0.6) return 'IN THE LIGHT';
  return 'UNSEEN';
}

export const DETECTION_ICONS = {
  UNSEEN: '●',
  MARKED: '▲',
  'IN THE LIGHT': '◉',
  SPOTTED: '✕',
};

export function drawGame(ctx, game) {
  const w = game.canvasW;
  const h = game.canvasH;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0708';
  ctx.fillRect(0, 0, w, h);

  if (game.state === 'title') {
    drawTitle(ctx, game);
    return;
  }

  ctx.save();
  ctx.translate(game.view.ox, game.view.oy);
  ctx.scale(game.view.scale, game.view.scale);
  drawWorld(ctx, game);
  drawCones(ctx, game);
  drawEntities(ctx, game);
  drawParticles(ctx, game);
  drawLighting(ctx, game);
  ctx.restore();

  drawHUD(ctx, game);

  if (game.state === 'paused') drawPause(ctx, game);
  if (game.state === 'levelComplete') drawLevelComplete(ctx, game);
  if (game.state === 'gameOver') drawGameOver(ctx, game);
  if (game.state === 'victory') drawVictory(ctx, game);
}

function drawWorld(ctx, game) {
  const grid = game.grid;
  const rows = grid.length;
  const cols = grid[0].length;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const ch = grid[ty][tx];
      const x = tx * TILE;
      const y = ty * TILE;
      if (ch === '#') {
        ctx.fillStyle = '#241a16';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#3a2a22';
        ctx.fillRect(x, y, TILE, 5);
        ctx.fillStyle = '#191008';
        ctx.fillRect(x, y + TILE - 4, TILE, 4);
      } else {
        // Charcoal-black floorboards with a plank seam every other tile.
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#17110e' : '#141009';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        if (ch === ',') {
          ctx.fillStyle = 'rgba(8, 6, 12, 0.55)';
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
      if (ch === 'T') {
        ctx.fillStyle = '#4a2f1d';
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = '#6b4426';
        ctx.fillRect(x + 3, y + 3, TILE - 6, 6);
        ctx.strokeStyle = '#2a1a0e';
        ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(x + TILE / 2 - 1, y + 6, 2, TILE - 12);
      }
      if (ch === 'l') {
        ctx.fillStyle = '#5a1f24';
        for (let i = 0; i < 5; i++) {
          const lx = x + 5 + i * 5;
          ctx.beginPath();
          ctx.arc(lx, y + TILE / 2 + (i % 2) * 4 - 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(x + 4, y + 4, TILE - 8, 2);
      }
      if (ch === 'L') {
        ctx.fillStyle = '#c9a227';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Rope lines along the top wall, a backstage signature.
  ctx.strokeStyle = 'rgba(180, 140, 80, 0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = 14 + i * 7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(cols * TILE / 2, y + 10, cols * TILE, y);
    ctx.stroke();
  }

  // Vents: trapdoors with a brass ring.
  for (const v of game.vents) {
    ctx.fillStyle = '#241812';
    ctx.fillRect(v.x - 13, v.y - 13, 26, 26);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.strokeRect(v.x - 13, v.y - 13, 26, 26);
    ctx.beginPath();
    ctx.moveTo(v.x - 8, v.y - 8);
    ctx.lineTo(v.x + 8, v.y + 8);
    ctx.moveTo(v.x + 8, v.y - 8);
    ctx.lineTo(v.x - 8, v.y + 8);
    ctx.stroke();
  }

  // Cue desks: small prompt desks with a brass lamp.
  for (const d of game.desks) {
    ctx.fillStyle = d.used ? '#3a2a1a' : '#5a3a1a';
    ctx.fillRect(d.x - 12, d.y - 9, 24, 18);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(d.x - 12, d.y - 9, 24, 3);
    ctx.fillStyle = '#e8d27a';
    ctx.beginPath();
    ctx.arc(d.x, d.y - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    if (d.near && !d.used) {
      ctx.fillStyle = '#f5e6a3';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('E: refill cue', d.x, d.y - 22);
    }
  }

  // Objective: the stolen score page, glowing gold.
  const obj = game.objective;
  if (obj && !obj.taken) {
    const pulse = 0.6 + Math.sin(game.time * 4) * 0.25;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#f5e6a3';
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f8f0c8';
    ctx.fillRect(obj.x - 8, obj.y - 11, 16, 22);
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(obj.x - 5, obj.y - 6 + i * 6);
      ctx.lineTo(obj.x + 5, obj.y - 6 + i * 6);
      ctx.stroke();
    }
    if (obj.near) {
      ctx.fillStyle = '#f5e6a3';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('E: steal the score page', obj.x, obj.y - 26);
    }
  }

  // Exit: the stage door, crimson with a gold frame.
  const exit = game.exit;
  if (exit) {
    ctx.fillStyle = game.player.hasObjective ? '#7a1020' : '#3a1218';
    ctx.fillRect(exit.x - 14, exit.y - 14, 28, 28);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.strokeRect(exit.x - 14, exit.y - 14, 28, 28);
    ctx.fillStyle = game.player.hasObjective ? '#f5e6a3' : '#8a7a5a';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', exit.x, exit.y + 4);
  }

  // Lasers: rigging safety lines, pulsing red.
  for (const laser of game.lasers) {
    const active = laserActive(laser, game.time);
    ctx.save();
    ctx.globalAlpha = active ? 0.9 : 0.18;
    ctx.strokeStyle = '#ff2e4d';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(laser.x1 * TILE, laser.y1 * TILE);
    ctx.lineTo(laser.x2 * TILE, laser.y2 * TILE);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(laser.x1 * TILE, laser.y1 * TILE, 4, 0, Math.PI * 2);
    ctx.arc(laser.x2 * TILE, laser.y2 * TILE, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCones(ctx, game) {
  const gel = game.level.gel || 'amber';
  const range = coneRange(game);

  // Camera cones, magenta usher lanterns.
  for (const cam of game.cameras) {
    const alpha = cam.detect > 0 ? 0.5 : 0.3;
    drawCone(ctx, cam.x, cam.y, cam.angle, cam.range, 0.5,
      `rgba(214, 51, 156, ${alpha})`, 'rgba(214, 51, 156, 0.6)');
  }

  // Guard vision cones in the level gel color.
  for (const g of game.guards) {
    let fill = GEL[gel];
    let stroke = GEL_CORE[gel];
    if (g.state === 'ALERT') {
      fill = 'rgba(255, 46, 77, 0.42)';
      stroke = 'rgba(255, 46, 77, 0.8)';
    } else if (g.state === 'SUSPICIOUS') {
      fill = 'rgba(245, 166, 35, 0.42)';
      stroke = 'rgba(245, 166, 35, 0.8)';
    }
    if (g.stunned > 0) {
      fill = 'rgba(120, 120, 120, 0.15)';
      stroke = 'rgba(160, 160, 160, 0.4)';
    }
    drawCone(ctx, g.x, g.y, g.angle, range, 0.61, fill, stroke);
  }

  // Moving followspot on Act 2.
  if (game.followspot) {
    const fs = game.followspot;
    const fx = fs.cx * TILE + Math.cos(game.time * fs.speed) * 150;
    const fy = fs.cy * TILE + Math.sin(game.time * fs.speed * 0.7) * 90;
    const grad = ctx.createRadialGradient(fx, fy, 4, fx, fy, fs.radius);
    grad.addColorStop(0, 'rgba(245, 220, 140, 0.5)');
    grad.addColorStop(1, 'rgba(245, 220, 140, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, fs.radius, 0, Math.PI * 2);
    ctx.fill();
    game.followspotPos = { x: fx, y: fy };
  }

  // Followspot cue: a hard amber beam pinned on the blinded guard.
  if (game.cues.followspot > 0 && game.cues.followspotTarget) {
    const t = game.cues.followspotTarget;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(245, 220, 140, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 260);
    ctx.lineTo(t.x - 26, t.y);
    ctx.lineTo(t.x + 26, t.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 220, 140, 0.35)';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawEntities(ctx, game) {
  // Thrown coins.
  for (const coin of game.coinsThrown) {
    ctx.fillStyle = '#f5d76e';
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6d3b';
    ctx.stroke();
  }

  // Crowd NPCs on Act 3: foyer guests drifting in place.
  if (game.crowd) {
    for (const c of game.crowd) {
      const bob = Math.sin(game.time * 1.5 + c.x) * 2;
      ctx.fillStyle = '#6b5a7a';
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8c8a8';
      ctx.beginPath();
      ctx.arc(c.x, c.y - 12 + bob, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cameras: small brass usher lanterns on the wall line.
  for (const cam of game.cameras) {
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cam.x + Math.cos(cam.angle) * 5, cam.y + Math.sin(cam.angle) * 5, 4, 0, Math.PI * 2);
    ctx.fill();
    if (cam.detect > 0.05) {
      ctx.fillStyle = `rgba(255, 46, 77, ${cam.detect})`;
      ctx.beginPath();
      ctx.arc(cam.x, cam.y - 12, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Guards: stagehands in aprons with a lamp, facing their patrol direction.
  for (const g of game.guards) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    ctx.fillStyle = g.state === 'ALERT' ? '#8a1a24' : '#3a3a4a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c8a8';
    ctx.fillRect(4, -6, 10, 12);
    ctx.fillStyle = '#f5d76e';
    ctx.beginPath();
    ctx.arc(14, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Detection meter ring above the guard.
    if (g.detect > 0.05) {
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(g.x, g.y - 20, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.detect);
      ctx.stroke();
      ctx.strokeStyle = g.detect >= 1 ? '#ff2e4d' : g.detect >= 0.5 ? '#f5a623' : '#e8d27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y - 20, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.detect);
      ctx.stroke();
    }
    if (g.state === 'ALERT') {
      ctx.fillStyle = '#ff2e4d';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', g.x, g.y - 30);
    } else if (g.state === 'SUSPICIOUS') {
      ctx.fillStyle = '#f5a623';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', g.x, g.y - 30);
    }
    if (g.stunned > 0) {
      ctx.fillStyle = '#f5e6a3';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('dazzled', g.x, g.y - 30);
    }
  }

  // Player: a small figure in a dark cloak with a gold mask glint.
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hidden) ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#1c1a26';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2e2a3e';
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(-8, 8);
  ctx.lineTo(8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(p.dir);
  ctx.fillStyle = '#f5d76e';
  ctx.beginPath();
  ctx.arc(7, -3, 2, 0, Math.PI * 2);
  ctx.arc(7, 3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Noise ring while sprinting.
  if (p.noise > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.noise * (0.7 + Math.sin(game.time * 6) * 0.15), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Fog cue visibly floods the tiles.
  if (game.cues.fog > 0) {
    ctx.fillStyle = 'rgba(200, 200, 210, 0.10)';
    ctx.fillRect(0, 0, game.grid[0].length * TILE, game.grid.length * TILE);
  }
}

function drawLighting(ctx, game) {
  const w = game.grid[0].length * TILE;
  const h = game.grid.length * TILE;
  if (game.cues.blackout > 0) {
    // Blackout: the sheet drops to lantern-orange pinpricks.
    ctx.fillStyle = 'rgba(5, 3, 5, 0.82)';
    ctx.fillRect(0, 0, w, h);
    for (const lamp of game.lamps) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 34);
      grad.addColorStop(0, 'rgba(245, 150, 40, 0.85)');
      grad.addColorStop(1, 'rgba(245, 150, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = game.player;
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 40);
    grad.addColorStop(0, 'rgba(245, 150, 40, 0.7)');
    grad.addColorStop(1, 'rgba(245, 150, 40, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Warm footlight glow rows and lamp halos.
  for (const lamp of game.lamps) {
    const grad = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 100);
    grad.addColorStop(0, 'rgba(245, 200, 90, 0.28)');
    grad.addColorStop(1, 'rgba(245, 200, 90, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 100, 0, Math.PI * 2);
    ctx.fill();
  }
  // Storm strobe on Act 4.
  if (game.level.storm && Math.sin(game.time * 2.3) > 0.92) {
    ctx.fillStyle = 'rgba(200, 220, 255, 0.14)';
    ctx.fillRect(0, 0, w, h);
  }
  // Hard shadow pools behind tall cover.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (let ty = 0; ty < game.grid.length; ty++) {
    for (let tx = 0; tx < game.grid[ty].length; tx++) {
      if (game.grid[ty][tx] === 'T') {
        ctx.fillRect(tx * TILE + 6, ty * TILE + TILE - 8, TILE - 12, 8);
      }
    }
  }
}

// ---------- HUD ----------
// Anchored layout: the top bar spans the full width, the side panel is
// anchored to the right edge, and critical UI sits inside the safe inset.
// Discrete values (score, suspicion, tokens, pages, detection, scene) come
// from the event driven HUD snapshot, game.hud. Only the meters that move
// every frame (timer, show clock progress, lux, noise) read live values.

function bar(ctx, x, y, w, h, frac, fill, label, fontPx) {
  ctx.fillStyle = '#241a16';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, Math.max(0, frac))), h - 2);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) {
    ctx.fillStyle = '#f5e6a3';
    ctx.font = fontPx + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y + h - 4);
  }
}

function drawHUD(ctx, game) {
  const h = game.hud;
  const s = uiScale(game);
  const w = game.canvasW;
  const panelW = uiPanelWidth(game);
  const px = w - panelW;
  const topH = Math.round(64 * s);
  const f = (size) => Math.round(size * s) + 'px';

  // Top bar, anchored top, full width.
  ctx.fillStyle = '#160d0d';
  ctx.fillRect(0, 0, w, topH);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, topH + 0.5);
  ctx.lineTo(w, topH + 0.5);
  ctx.stroke();
  ctx.fillStyle = '#f5e6a3';
  ctx.font = 'bold ' + f(20) + ' serif';
  ctx.textAlign = 'left';
  ctx.fillText('PROMPT SIDE', SAFE, topH * 0.42);
  ctx.fillStyle = '#d8c8a8';
  ctx.font = f(13) + ' sans-serif';
  ctx.fillText(h.levelName + '  |  ' + h.levelScene, SAFE, topH * 0.82);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5e6a3';
  ctx.font = 'bold ' + f(15) + ' sans-serif';
  ctx.fillText('Score ' + h.score, px - SAFE, topH * 0.42);
  ctx.fillStyle = '#d8c8a8';
  ctx.font = f(13) + ' sans-serif';
  ctx.fillText('Time ' + Math.floor(game.levelTime) + 's', px - SAFE, topH * 0.82);
  ctx.textAlign = 'left';

  // Objective and message lines, inside the safe inset.
  ctx.fillStyle = '#e8d27a';
  ctx.font = f(13) + ' sans-serif';
  ctx.fillText('Goal: ' + h.objective, SAFE, topH + 20 * s);
  if (h.message) {
    ctx.fillStyle = '#f5e6a3';
    ctx.font = 'italic ' + f(13) + ' sans-serif';
    ctx.fillText(h.message, SAFE, topH + 40 * s);
  }

  // Right panel, anchored to the right edge.
  ctx.fillStyle = '#120a0a';
  ctx.fillRect(px, topH, panelW, game.canvasH - topH);
  ctx.strokeStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(px + 0.5, topH);
  ctx.lineTo(px + 0.5, game.canvasH);
  ctx.stroke();
  let y = topH + 22 * s;
  const lx = px + SAFE;
  const lw = panelW - SAFE * 2;
  const body = f(13);
  const small = f(12);
  const heading = 'bold ' + f(14) + ' sans-serif';

  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('SHOW CLOCK', lx, y);
  y += 8 * s;
  bar(ctx, lx, y, lw, 12, game.cues.sceneTimer / game.cues.sceneDuration, '#7a1020', '', 11);
  y += 26 * s;
  ctx.fillStyle = '#d8c8a8';
  ctx.font = small;
  ctx.fillText('Scene ' + (h.scene + 1) + ' of ' + h.sceneTotal + ', next scene in ' +
    Math.max(0, Math.ceil(game.cues.sceneDuration - game.cues.sceneTimer)) + 's', lx, y);
  y += 24 * s;
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('CUE BOARD  (tokens: ' + h.tokens + ')', lx, y);
  y += 22 * s;
  CUES.forEach((cue, i) => {
    const active = (i === 0 && game.cues.blackout > 0) ||
      (i === 1 && game.cues.thunder > 0) ||
      (i === 2 && game.cues.fog > 0) ||
      (i === 3 && game.cues.followspot > 0);
    const remaining = i === 0 ? game.cues.blackout : i === 1 ? game.cues.thunder : i === 2 ? game.cues.fog : game.cues.followspot;
    ctx.fillStyle = active ? '#f5a623' : '#d8c8a8';
    ctx.font = small;
    ctx.fillText((i + 1) + ' ' + cue.name + (active ? '  ' + Math.ceil(remaining) + 's' : ''), lx, y);
    y += 16 * s;
  });
  y += 18 * s;
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('HOUSE SUSPICION  ' + h.suspicion + '%', lx, y);
  y += 8 * s;
  const suspColor = h.suspicion > 70 ? '#ff2e4d' : h.suspicion > 40 ? '#f5a623' : '#c9a227';
  bar(ctx, lx, y, lw, 12, h.suspicion / 100, suspColor, '', 11);
  y += 30 * s;
  // Detection state: icon plus word, never color alone.
  const label = h.detection;
  ctx.fillStyle = label === 'SPOTTED' ? '#ff2e4d' : label === 'MARKED' ? '#f5a623' : '#e8d27a';
  ctx.font = 'bold ' + f(14) + ' sans-serif';
  ctx.fillText('STATUS: ' + (DETECTION_ICONS[label] || '●') + ' ' + label, lx, y);
  y += 20 * s;
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('VISIBILITY (lux)', lx, y);
  y += 6 * s;
  bar(ctx, lx, y, lw, 10, game.playerLight, game.playerLight > 0.6 ? '#f5a623' : '#5a7a6a', '', 11);
  y += 24 * s;
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('NOISE vs APPLAUSE MASK', lx, y);
  y += 6 * s;
  const noiseFrac = game.cues.thunder > 0 ? 0 : game.player.noise / 150;
  bar(ctx, lx, y, lw, 10, noiseFrac, game.cues.thunder > 0 ? '#37d3c8' : '#a03a3a',
    game.cues.thunder > 0 ? 'masked by applause' : '', 11);
  y += 26 * s;
  ctx.fillStyle = '#d8c8a8';
  ctx.font = body;
  ctx.fillText('Score pages: ' + h.pages + ' / 5', lx, y);
  y += 16 * s;
  ctx.fillText('Spotted: ' + h.spotted + ' times', lx, y);
  y += 16 * s;
  ctx.fillText('Coins left: ' + h.coins, lx, y);
  y += 16 * s;
  ctx.fillText('Goal: ' + (h.hasObjective ? 'reach the EXIT' : 'steal the score page'), lx, y);
  y += 24 * s;

  // Legend: every icon in the game.
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('LEGEND', lx, y);
  y += 20 * s;
  const legend = [
    ['guard + cone', '#3a3a4a', 'stagehand, watch the cone'],
    ['camera', '#c9a227', 'usher lantern, sweeps a cone'],
    ['tall crate', '#4a2f1d', 'blocks sight and movement'],
    ['low cover', '#5a1f24', 'hide here while sneaking'],
    ['lamp light', '#f5d76e', 'bright, seen faster'],
    ['deep shadow', '#0a0810', 'dark, hard to be seen'],
    ['laser', '#ff2e4d', 'rigging line, pulses on and off'],
    ['vent', '#241812', 'press E to crawl through'],
    ['objective', '#f8f0c8', 'the score page to steal'],
    ['exit', '#7a1020', 'stage door, opens after the steal'],
  ];
  for (const [name, color, desc] of legend) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, y - 10, 12, 12);
    ctx.strokeStyle = '#c9a227';
    ctx.strokeRect(lx + 0.5, y - 9.5, 12, 12);
    ctx.fillStyle = '#d8c8a8';
    ctx.font = f(11) + ' sans-serif';
    ctx.fillText(name + ': ' + desc, lx + 18, y);
    y += 16 * s;
  }
  y += 18 * s;
  ctx.fillStyle = '#f5e6a3';
  ctx.font = heading;
  ctx.fillText('CONTROLS', lx, y);
  y += 20 * s;
  const controls = [
    'WASD / arrows: move',
    'Shift: sneak (slow, silent)',
    'Space: sprint (fast, loud)',
    'E: interact, hide, pick up, vent',
    'Click: throw a coin decoy',
    '1-4: fire a stage cue',
    'Esc: pause   R: retry   M: mute',
  ];
  ctx.fillStyle = '#d8c8a8';
  ctx.font = f(11) + ' sans-serif';
  for (const line of controls) {
    y += 15 * s;
    ctx.fillText(line, lx, y);
  }
}

// ---------- Screens ----------
// Every screen is centred on the window and scales with the UI scale, so
// it holds together at any window size.

function overlay(ctx, game) {
  ctx.fillStyle = 'rgba(8, 4, 5, 0.88)';
  ctx.fillRect(0, 0, game.canvasW, game.canvasH);
}

function centerText(ctx, game, text, y, font, color) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, game.canvasW / 2, y);
  ctx.textAlign = 'left';
}

function drawTitle(ctx, game) {
  const s = uiScale(game);
  const cx = game.canvasW / 2;
  const cy = game.canvasH / 2;
  ctx.fillStyle = '#0b0708';
  ctx.fillRect(0, 0, game.canvasW, game.canvasH);
  // A painted backdrop: crimson curtain folds, sized to the window.
  const halfW = Math.min(420, game.canvasW / 2 - SAFE);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#4a0d16' : '#6b1220';
    ctx.beginPath();
    ctx.moveTo(cx - halfW + i * (halfW * 2 / 12), 0);
    ctx.lineTo(cx - halfW + (i + 0.5) * (halfW * 2 / 12), 0);
    ctx.lineTo(cx - halfW + (i + 0.3) * (halfW * 2 / 12), cy - 60);
    ctx.lineTo(cx - halfW + (i - 0.2) * (halfW * 2 / 12), cy - 60);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(cx - halfW, cy - 92, halfW * 2, 3);
  centerText(ctx, game, 'PROMPT SIDE', cy - 110, 'bold ' + Math.round(64 * s) + 'px serif', '#f5e6a3');
  centerText(ctx, game, 'Steal the Composer\'s score from a grand 1890s opera house, mid-performance,', cy - 40, Math.round(17 * s) + 'px sans-serif', '#d8c8a8');
  centerText(ctx, game, 'and turn the stage lighting board into your weapon.', cy - 14, Math.round(17 * s) + 'px sans-serif', '#d8c8a8');
  centerText(ctx, game, 'WASD move   Shift sneak   Space sprint   E interact   Click throws a coin   1-4 fire cues', cy + 30, Math.round(14 * s) + 'px sans-serif', '#e8d27a');
  centerText(ctx, game, 'Cues: 1 BLACKOUT  2 THUNDER SHEET  3 FOG DRUM  4 FOLLOWSPOT', cy + 56, Math.round(14 * s) + 'px sans-serif', '#e8d27a');
  centerText(ctx, game, 'Click or press Enter to start Act 1', cy + 96, 'bold ' + Math.round(18 * s) + 'px sans-serif', '#f5e6a3');
  centerText(ctx, game, 'Five acts. Steal the score, reach the exit, never get caught.', cy + 124, Math.round(13 * s) + 'px sans-serif', '#8a7a5a');
}

function drawPause(ctx, game) {
  const s = uiScale(game);
  overlay(ctx, game);
  centerText(ctx, game, 'PAUSED', game.canvasH / 2 - 40, 'bold ' + Math.round(44 * s) + 'px serif', '#f5e6a3');
  centerText(ctx, game, 'Esc to resume   R to retry the act   M to mute', game.canvasH / 2 + 10, Math.round(16 * s) + 'px sans-serif', '#d8c8a8');
}

function drawLevelComplete(ctx, game) {
  const s = uiScale(game);
  overlay(ctx, game);
  const cy = game.canvasH / 2;
  centerText(ctx, game, 'ACT COMPLETE', cy - 60, 'bold ' + Math.round(44 * s) + 'px serif', '#f5e6a3');
  centerText(ctx, game, game.level.name, cy - 20, Math.round(20 * s) + 'px sans-serif', '#d8c8a8');
  centerText(ctx, game, 'Score page stolen' + (game.ghostThisLevel ? '  |  GHOST bonus +500, never spotted' : ''), cy + 12, Math.round(16 * s) + 'px sans-serif', '#e8d27a');
  centerText(ctx, game, 'Score: ' + game.score, cy + 44, Math.round(16 * s) + 'px sans-serif', '#f5e6a3');
  centerText(ctx, game, 'Press Enter for the next act', cy + 84, 'bold ' + Math.round(17 * s) + 'px sans-serif', '#f5e6a3');
}

function drawGameOver(ctx, game) {
  const s = uiScale(game);
  overlay(ctx, game);
  const cy = game.canvasH / 2;
  centerText(ctx, game, 'THE CURTAIN DROPS', cy - 60, 'bold ' + Math.round(44 * s) + 'px serif', '#ff2e4d');
  centerText(ctx, game, game.loseReason || 'You were caught.', cy - 20, Math.round(19 * s) + 'px sans-serif', '#d8c8a8');
  centerText(ctx, game, 'Score: ' + game.score + '   Acts finished: ' + game.levelIndex, cy + 12, Math.round(16 * s) + 'px sans-serif', '#f5e6a3');
  centerText(ctx, game, 'Press R to retry the act, or Enter to start over', cy + 52, Math.round(16 * s) + 'px sans-serif', '#d8c8a8');
}

function drawVictory(ctx, game) {
  const s = uiScale(game);
  overlay(ctx, game);
  const cy = game.canvasH / 2;
  centerText(ctx, game, 'CURTAIN CALL', cy - 60, 'bold ' + Math.round(48 * s) + 'px serif', '#f5e6a3');
  centerText(ctx, game, 'The full Score is yours. The house never knew you were there.', cy - 20, Math.round(18 * s) + 'px sans-serif', '#d8c8a8');
  centerText(ctx, game, 'Final score: ' + game.score + '   Times spotted: ' + game.spotted, cy + 16, Math.round(17 * s) + 'px sans-serif', '#f5e6a3');
  centerText(ctx, game, 'Press Enter to play again', cy + 56, 'bold ' + Math.round(17 * s) + 'px sans-serif', '#f5e6a3');
}
