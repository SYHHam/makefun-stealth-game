// PROMPT SIDE: rendering. One file, one job: everything the player sees.
// The canvas is 1280 by 720. Layout: a top bar, goal lines, a CAMPAIGN
// panel on the left, the playfield in the middle, and a right panel with
// the Show Clock, the Cue Board, suspicion, status and the legend.
// Screens: title, gameplay, pause, intermission, strike-lost, victory,
// game-over. All art is drawn in code; there are no image assets.

import { TILE, COLS, ROWS, ACT_ITINERARY, GADGETS, tileCenter } from './levels.js';
import { coneRangeFactor } from './cues.js';
import { CUES } from './cues.js';

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

const VIEW = { left: 232, top: 80, right: 984, bottom: 704 };
const PANEL_X = 992;
const PANEL_W = 272;
const CAMPAIGN = { x: 16, y: 160, w: 200, h: 232 };

const GOLD = '#c9a227';
const GOLD_DIM = '#8a7a3a';
const CREAM = '#e8dcc0';
const MUTED = '#8a7f6a';
const CRIMSON = '#8b1a1a';
const CRIMSON_BRIGHT = '#a02020';
const DARK = '#0d0a08';
const PANEL_BG = '#14100c';

const CONE_COLORS = {
  amber: 'rgba(232, 160, 32, 0.28)',
  cyan: 'rgba(64, 160, 192, 0.28)',
  magenta: 'rgba(192, 64, 160, 0.28)',
};
const CONE_EDGE = {
  amber: 'rgba(232, 160, 32, 0.55)',
  cyan: 'rgba(64, 160, 192, 0.55)',
  magenta: 'rgba(192, 64, 160, 0.55)',
};
const GEL_TINT = {
  amber: 'rgba(232, 160, 32, 0.06)',
  green: 'rgba(80, 180, 90, 0.08)',
  warm: 'rgba(255, 190, 90, 0.09)',
  storm: 'rgba(90, 120, 220, 0.09)',
  gold: 'rgba(212, 175, 55, 0.07)',
};

// The view maps world pixels (768 by 512) into the playfield rect.
export function createView() {
  const worldW = COLS * TILE;
  const worldH = ROWS * TILE;
  const rectW = VIEW.right - VIEW.left;
  const rectH = VIEW.bottom - VIEW.top;
  const scale = Math.min(rectW / worldW, rectH / worldH);
  const ox = VIEW.left + (rectW - worldW * scale) / 2;
  const oy = VIEW.top + (rectH - worldH * scale) / 2;
  return {
    scale,
    ox,
    oy,
    toWorld(cx, cy) {
      const wx = (cx - ox) / scale;
      const wy = (cy - oy) / scale;
      if (wx < 0 || wy < 0 || wx > worldW || wy > worldH) return null;
      return { x: wx, y: wy };
    },
    toScreen(wx, wy) {
      return { x: ox + wx * scale, y: oy + wy * scale };
    },
  };
}

function bar(ctx, x, y, w, h, frac, fill, bg) {
  ctx.fillStyle = bg || '#2a2118';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, Math.min(w, w * frac)), h);
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function text(ctx, s, x, y, size, color, align, bold, italic) {
  ctx.font = (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + size + 'px Georgia, serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function sans(ctx, s, x, y, size, color, align, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px Arial, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function drawCone(ctx, view, x, y, dir, halfAngle, range, color) {
  const p = view.toScreen(x, y);
  const r = range * view.scale;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, r, dir - halfAngle, dir + halfAngle);
  ctx.closePath();
  ctx.fillStyle = CONE_COLORS[color] || CONE_COLORS.amber;
  ctx.fill();
  ctx.strokeStyle = CONE_EDGE[color] || CONE_EDGE.amber;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// The top bar: title, act and scene, score and time.
function drawTopBar(game, ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CANVAS_W, 64);
  const level = game.level;
  text(ctx, 'PROMPT SIDE', 16, 30, 26, GOLD, 'left', true);
  sans(ctx, 'Act ' + (game.levelIndex + 1) + ': ' + level.name + '  |  ' + level.scene, 16, 52, 13, CREAM);
  sans(ctx, 'Score ' + game.score, CANVAS_W - 16, 30, 16, CREAM, 'right', true);
  sans(ctx, 'Time ' + Math.floor(game.levelTime) + 's', CANVAS_W - 16, 52, 13, CREAM, 'right');
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 64.5);
  ctx.lineTo(CANVAS_W - 16, 64.5);
  ctx.stroke();
}

function drawGoalLines(game, ctx) {
  const level = game.level;
  sans(ctx, 'Goal: ' + level.goal, 16, 82, 14, CREAM);
}

// The CAMPAIGN panel: five acts, current highlighted, completed checked.
function drawCampaignPanel(game, ctx) {
  const { x, y, w, h } = CAMPAIGN;
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  sans(ctx, 'CAMPAIGN   ACT ' + (game.levelIndex + 1) + ' / 5', x + 10, y + 20, 13, GOLD, 'left', true);
  for (let i = 0; i < ACT_ITINERARY.length; i++) {
    const act = ACT_ITINERARY[i];
    const ry = y + 36 + i * 22;
    const done = game.completedActs[i];
    const current = i === game.levelIndex;
    if (current) {
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(x + 2, ry - 14, w - 4, 20);
    }
    let label = (done ? '\u2713 ' : '\u00B7 ') + (i + 1) + '  ' + act.name;
    if (label.length > 24) label = label.slice(0, 24);
    const color = current ? '#ffffff' : done ? CREAM : MUTED;
    ctx.globalAlpha = current || done ? 1 : 0.55;
    sans(ctx, label, x + 10, ry, 12, color, 'left', current);
    ctx.globalAlpha = 1;
  }
  const divY = y + 36 + 5 * 22 + 4;
  ctx.strokeStyle = GOLD_DIM;
  ctx.beginPath();
  ctx.moveTo(x + 10, divY);
  ctx.lineTo(x + w - 10, divY);
  ctx.stroke();
  sans(ctx, 'SCORE PAGES ' + game.pages + ' / 5', x + 10, divY + 18, 12, CREAM, 'left', true);
  sans(ctx, 'SCORE ' + game.score, x + 10, divY + 34, 12, CREAM);
  // Strikes: filled pips are the ones still standing.
  sans(ctx, 'STRIKES', x + 10, divY + 50, 12, CREAM, 'left', true);
  for (let i = 0; i < 3; i++) {
    const px = x + 78 + i * 16;
    const py = divY + 45;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    if (i < game.strikes) {
      ctx.fillStyle = GOLD;
      ctx.fill();
    } else {
      ctx.strokeStyle = CRIMSON_BRIGHT;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 3, py - 3);
      ctx.lineTo(px + 3, py + 3);
      ctx.moveTo(px + 3, py - 3);
      ctx.lineTo(px - 3, py + 3);
      ctx.stroke();
    }
  }
  sans(ctx, 'HEAT ' + game.heat + '%', x + 10, divY + 68, 12, CREAM, 'left', true);
  bar(ctx, x + 78, divY + 59, 110, 9, game.heat / 100, game.heat > 70 ? '#c04030' : GOLD);
}

// The right panel: Show Clock, Cue Board, suspicion, status, legend.
function drawRightPanel(game, ctx) {
  const x = PANEL_X;
  const w = PANEL_W;
  let y = 80;
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x - 8, y - 8, w + 8, 624);
  sans(ctx, 'SHOW CLOCK', x, y + 6, 13, GOLD, 'left', true);
  const sceneLen = 45;
  const sceneT = game.levelTime % sceneLen;
  bar(ctx, x, y + 14, w - 16, 10, sceneT / sceneLen, '#a02020');
  const sceneN = Math.floor(game.levelTime / sceneLen) % 3 + 1;
  sans(ctx, 'Scene ' + sceneN + ' of 3, next scene in ' + Math.ceil(sceneLen - sceneT) + 's', x, y + 40, 12, CREAM);
  y += 56;
  sans(ctx, 'CUE BOARD   (tokens: ' + game.cueTokens + ')', x, y + 6, 13, GOLD, 'left', true);
  for (let i = 0; i < CUES.length; i++) {
    const cue = CUES[i];
    const active = game.cueFx[cue.id] > 0;
    sans(ctx, cue.key + ' ' + cue.name + (active ? '  *' : ''), x, y + 24 + i * 16, 12, active ? '#ffd24a' : CREAM, 'left', active);
  }
  y += 56 + 3 * 16;
  sans(ctx, 'HOUSE SUSPICION ' + game.suspicion + '%', x, y + 6, 13, GOLD, 'left', true);
  bar(ctx, x, y + 14, w - 16, 10, game.suspicion / 100, game.suspicion > 70 ? '#c04030' : GOLD);
  y += 40;
  sans(ctx, 'STATUS: \u2022 ' + game.status, x, y + 6, 13, game.status === 'UNSEEN' ? CREAM : '#ff9a7a', 'left', true);
  sans(ctx, 'VISIBILITY (lux)', x, y + 26, 12, GOLD, 'left', true);
  bar(ctx, x, y + 32, w - 16, 8, game.lux, '#7fb8c9');
  sans(ctx, 'NOISE vs APPLAUSE MASK', x, y + 52, 12, GOLD, 'left', true);
  bar(ctx, x, y + 58, w - 16, 8, game.player.noise, '#c9a227');
  if (game.cueFx.thunder > 0) {
    sans(ctx, 'applause masks all noise', x, y + 74, 11, '#ffd24a');
  }
  y += 84;
  sans(ctx, 'Spotted: ' + game.spotted + ' times', x, y + 6, 12, CREAM);
  sans(ctx, 'Coins left: ' + game.coins, x, y + 22, 12, CREAM);
  sans(ctx, 'Goal: steal the score page', x, y + 38, 12, CREAM, 'left', true);
  y += 56;
  sans(ctx, 'LEGEND', x, y + 6, 13, GOLD, 'left', true);
  const legend = [
    ['#3a4a6a', 'guard + cone: stagehand, watch the cone'],
    ['#c9a227', 'camera: usher lantern, sweeps a cone'],
    ['#5a4028', 'tall crate: blocks sight and movement'],
    ['#4a2a2a', 'low cover: hide here while sneaking'],
    ['#e8c860', 'lamp light: bright, seen faster'],
    ['#1a2030', 'deep shadow: dark, hard to be seen'],
    ['#c04050', 'laser: rigging line, pulses on and off'],
    ['#c9a227', 'vent: press E to crawl through'],
    ['#f0e6cc', 'objective: the score page to steal'],
    ['#a02020', 'exit: stage door, opens after the steal'],
  ];
  for (let i = 0; i < legend.length; i++) {
    const ly = y + 22 + i * 15;
    ctx.fillStyle = legend[i][0];
    ctx.fillRect(x, ly - 9, 10, 10);
    ctx.strokeStyle = GOLD_DIM;
    ctx.strokeRect(x + 0.5, ly - 9.5, 10, 10);
    sans(ctx, legend[i][1], x + 16, ly, 11, MUTED);
  }
  y += 22 + legend.length * 15 + 10;
  sans(ctx, 'CONTROLS', x, y + 6, 13, GOLD, 'left', true);
  const controls = [
    'WASD / arrows: move',
    'Shift: sneak (slow, silent)',
    'Space: sprint (fast, loud)',
    'E: interact, hide, pick up, vent',
    'Click: throw a coin decoy',
    '1-4: fire a stage cue',
    'Esc: pause    R: retry act',
  ];
  for (let i = 0; i < controls.length; i++) {
    sans(ctx, controls[i], x, y + 24 + i * 15, 11, MUTED);
  }
}

function drawWorld(game, ctx, view) {
  const level = game.level;
  const s = view.scale;
  const ox = view.ox;
  const oy = view.oy;
  // Floor.
  ctx.fillStyle = '#171310';
  ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
  // Floor grid and tiles.
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const t = level.grid[ty][tx];
      const px = ox + tx * TILE * s;
      const py = oy + ty * TILE * s;
      const w = TILE * s;
      if (t === '#') {
        ctx.fillStyle = '#33291f';
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(px, py, w, 2);
      } else if (t === 'C') {
        ctx.fillStyle = '#5a4028';
        ctx.fillRect(px + 2, py + 2, w - 4, w - 4);
        ctx.fillStyle = '#c9a227';
        ctx.fillRect(px + 2, py + 2, w - 4, 3);
        ctx.strokeStyle = '#2a1c10';
        ctx.strokeRect(px + 2.5, py + 2.5, w - 5, w - 5);
      } else if (t === 'c') {
        ctx.fillStyle = '#4a2a2a';
        ctx.fillRect(px + 3, py + 3, w - 6, w - 6);
        ctx.fillStyle = '#7a4a3a';
        ctx.fillRect(px + 3, py + 3, w - 6, 3);
      } else if (t === 'D') {
        ctx.fillStyle = '#141a26';
        ctx.fillRect(px, py, w, w);
      } else {
        ctx.fillStyle = '#1b1611';
        ctx.fillRect(px, py, w, w);
      }
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w, w);
    }
  }
  // Rope lines across the top of the stage.
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ry = oy + 8 + i * 6;
    ctx.beginPath();
    ctx.moveTo(ox, ry);
    ctx.lineTo(ox + COLS * TILE * s, ry);
    ctx.stroke();
  }
  // Lamp glows.
  for (const lamp of game.lamps) {
    const c = tileCenter(lamp.x, lamp.y);
    const p = view.toScreen(c.x, c.y);
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 3 * TILE * s);
    grad.addColorStop(0, 'rgba(255, 210, 110, 0.30)');
    grad.addColorStop(1, 'rgba(255, 210, 110, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * TILE * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c860';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Vents.
  for (const v of game.level.vents) {
    for (const end of [v.a, v.b]) {
      const c = tileCenter(end.x, end.y);
      const p = view.toScreen(c.x, c.y);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      const r = 9 * s + 4;
      ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.beginPath();
      ctx.moveTo(p.x - r + 3, p.y - r + 3);
      ctx.lineTo(p.x + r - 3, p.y + r - 3);
      ctx.moveTo(p.x + r - 3, p.y - r + 3);
      ctx.lineTo(p.x - r + 3, p.y + r - 3);
      ctx.stroke();
    }
  }
  // Lasers.
  for (const laser of game.lasers) {
    const on = laser.disabled <= 0 && (laser.t % laser.period) < laser.period * 0.55;
    if (!on) continue;
    const a = view.toScreen(laser.x1, laser.y1);
    const b = view.toScreen(laser.x2, laser.y2);
    ctx.strokeStyle = 'rgba(192, 64, 80, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(192, 64, 80, 0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Objective page.
  if (!game.objectiveTaken) {
    const o = tileCenter(level.objective.x, level.objective.y);
    const p = view.toScreen(o.x, o.y);
    const pulse = 1 + 0.12 * Math.sin(game.time * 3);
    ctx.fillStyle = '#f0e6cc';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a7a3a';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y + i * 4);
      ctx.lineTo(p.x + 5, p.y + i * 4);
      ctx.stroke();
    }
  }
  // Exit.
  const ex = tileCenter(level.exit.x, level.exit.y);
  const ep = view.toScreen(ex.x, ex.y);
  const open = game.objectiveTaken;
  ctx.strokeStyle = open ? '#7ac74a' : GOLD;
  ctx.lineWidth = 2;
  const er = 12 * s + 4;
  ctx.strokeRect(ep.x - er, ep.y - er, er * 2, er * 2);
  ctx.fillStyle = open ? '#7ac74a' : GOLD;
  sans(ctx, 'EXIT', ep.x, ep.y + 4, 10, open ? '#7ac74a' : GOLD, 'center', true);
  // Thrown coins.
  for (const c of game.coinsThrown) {
    const p = view.toScreen(c.x, c.y);
    ctx.fillStyle = '#e8c860';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.coinLure) {
    const p = view.toScreen(game.coinLure.x, game.coinLure.y);
    ctx.strokeStyle = 'rgba(232, 200, 96, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12 + 4 * Math.sin(game.time * 6), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Camera cones, then cameras.
  for (const cam of game.cameras) {
    if (game.cueFx.blackout <= 0) {
      drawCone(ctx, view, cam.x, cam.y, cam.dir, (25 * Math.PI) / 180, cam.range, cam.color);
    }
    const p = view.toScreen(cam.x, cam.y);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (cam.meter > 0) {
      ctx.fillStyle = '#c04030';
      ctx.fillRect(p.x - 10, p.y - 16, 20 * (cam.meter / 100), 3);
    }
  }
  // Guard cones, then guards.
  for (const g of game.guards) {
    const range = g.coneTiles * TILE * coneRangeFactor(game);
    const half = g.state === 'chase' ? (50 * Math.PI) / 180 : (35 * Math.PI) / 180;
    drawCone(ctx, view, g.x, g.y, g.dir, half, range, g.color);
  }
  for (const g of game.guards) {
    const p = view.toScreen(g.x, g.y);
    ctx.fillStyle = '#3a4a6a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e8c860';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(g.dir) * 5, p.y + Math.sin(g.dir) * 5, 3, 0, Math.PI * 2);
    ctx.fill();
    if (g.suspicion > 0) {
      const mark = g.state === 'chase' ? '!' : '?';
      sans(ctx, mark, p.x, p.y - 16, 14, g.state === 'chase' ? '#ff6a4a' : '#ffd24a', 'center', true);
    }
  }
  // The player.
  const pp = view.toScreen(game.player.x, game.player.y);
  ctx.fillStyle = game.player.hidden ? 'rgba(232, 220, 192, 0.55)' : '#f0e6cc';
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8b1a1a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#8b1a1a';
  ctx.beginPath();
  ctx.moveTo(pp.x, pp.y);
  ctx.lineTo(pp.x + Math.cos(game.player.dir) * 13, pp.y + Math.sin(game.player.dir) * 13);
  ctx.stroke();
  if (game.player.hidden) {
    ctx.strokeStyle = 'rgba(232, 220, 192, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Dust motes drifting in the beams.
  ctx.fillStyle = 'rgba(232, 200, 120, 0.35)';
  for (let i = 0; i < 24; i++) {
    const mx = ((i * 97 + game.time * 6) % (COLS * TILE));
    const my = ((i * 61 + game.time * 3) % (ROWS * TILE));
    const p = view.toScreen(mx, my);
    ctx.fillRect(p.x, p.y, 1.5, 1.5);
  }
  // Gel wash for the act.
  const tint = GEL_TINT[level.gel] || GEL_TINT.amber;
  ctx.fillStyle = tint;
  ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
  // Fog: pale wash plus drifting blobs.
  if (level.fog || game.cueFx.fog > 0) {
    ctx.fillStyle = 'rgba(200, 200, 210, 0.10)';
    ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
    ctx.fillStyle = 'rgba(200, 200, 210, 0.08)';
    for (let i = 0; i < 6; i++) {
      const fx = ox + ((i * 173 + game.time * 12) % (COLS * TILE * s));
      const fy = oy + ((i * 131 + game.time * 5) % (ROWS * TILE * s));
      ctx.beginPath();
      ctx.ellipse(fx, fy, 90, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Blackout: the sheet drops to lantern pinpricks.
  if (game.cueFx.blackout > 0) {
    ctx.fillStyle = 'rgba(5, 4, 3, 0.72)';
    ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
    for (const lamp of game.lamps) {
      const c = tileCenter(lamp.x, lamp.y);
      const p = view.toScreen(c.x, c.y);
      const grad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 60);
      grad.addColorStop(0, 'rgba(255, 180, 80, 0.5)');
      grad.addColorStop(1, 'rgba(255, 180, 80, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 60, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Storm strobe: a brief white flash on the scene change.
  if (level.gel === 'storm' && game.strobe > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (game.strobe * 0.12) + ')';
    ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
  }
  // World border.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, COLS * TILE * s, ROWS * TILE * s);
}

function dimWorld(ctx) {
  ctx.fillStyle = 'rgba(5, 4, 3, 0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function card(ctx, x, y, w, h) {
  ctx.fillStyle = '#171008';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function drawTitle(game, ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  text(ctx, 'PROMPT SIDE', CANVAS_W / 2, 110, 64, GOLD, 'center', true);
  sans(ctx, 'Steal the Composer\u2019s score from a grand 1890s opera house,', CANVAS_W / 2, 150, 16, CREAM, 'center');
  sans(ctx, 'while the opera is being performed.', CANVAS_W / 2, 172, 16, CREAM, 'center');
  sans(ctx, 'THE FIVE ACTS', CANVAS_W / 2, 230, 14, GOLD, 'center', true);
  for (let i = 0; i < ACT_ITINERARY.length; i++) {
    const act = ACT_ITINERARY[i];
    sans(ctx, (i + 1) + '  ' + act.name + '  \u2014  ' + act.scene, CANVAS_W / 2, 258 + i * 28, 14, CREAM, 'center');
  }
  sans(ctx, 'GADGETS', CANVAS_W / 2, 420, 14, GOLD, 'center', true);
  const gx = [520, 640, 760];
  for (let i = 0; i < GADGETS.length; i++) {
    const x = gx[i];
    const y = 460;
    if (GADGETS[i].id === 'coin') {
      ctx.fillStyle = '#e8c860';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a7a3a';
      ctx.stroke();
    } else if (GADGETS[i].id === 'smoke') {
      ctx.strokeStyle = '#b8b0a0';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x - 10 + k * 10, y, 8, Math.PI, 0);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(x - 8, y - 12, 16, 20);
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.lineTo(x, y + 26);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
      ctx.fill();
    }
    sans(ctx, GADGETS[i].label, x, y + 48, 12, CREAM, 'center', true);
  }
  sans(ctx, 'WASD move  \u00B7  Shift sneak  \u00B7  Space sprint  \u00B7  E interact  \u00B7  Click throw a coin  \u00B7  1-4 fire a cue', CANVAS_W / 2, 560, 13, MUTED, 'center');
  sans(ctx, 'Press Enter to begin. Steal the score page, then reach the exit.', CANVAS_W / 2, 600, 15, CREAM, 'center', true);
}

function drawIntermission(game, ctx) {
  dimWorld(ctx);
  const x = 340, y = 140, w = 600, h = 440;
  card(ctx, x, y, w, h);
  const s = game.actSummary();
  text(ctx, 'INTERMISSION', CANVAS_W / 2, y + 64, 40, GOLD, 'center', true);
  sans(ctx, 'ACT ' + s.act + ' COMPLETE  |  Act ' + s.act + ': ' + s.name, CANVAS_W / 2, y + 100, 15, CREAM, 'center', true);
  for (let i = 0; i < ACT_ITINERARY.length; i++) {
    const done = game.completedActs[i];
    const mark = done ? '\u2713 ' : (i === s.next - 1 ? '\u25B6 ' : '\u00B7 ');
    sans(ctx, mark + (i + 1) + '  ' + ACT_ITINERARY[i].name, CANVAS_W / 2, y + 140 + i * 26, 14, done ? CREAM : MUTED, 'center', i === s.next - 1);
  }
  sans(ctx, 'ACT PAGES ' + s.actPages + ' / 1    SCORE PAGES ' + s.campaignPages + ' / 5', CANVAS_W / 2, y + 290, 14, CREAM, 'center', true);
  sans(ctx, 'SCORE ' + s.score + '    STRIKES ' + s.strikes + ' / 3    HEAT ' + s.heat + '%', CANVAS_W / 2, y + 318, 14, CREAM, 'center');
  sans(ctx, 'NEXT: ACT ' + s.next + '  ' + (ACT_ITINERARY[s.next - 1] ? ACT_ITINERARY[s.next - 1].name : ''), CANVAS_W / 2, y + 360, 16, GOLD, 'center', true);
  sans(ctx, 'Press Enter to continue', CANVAS_W / 2, y + 398, 14, CREAM, 'center');
}

function drawStrikeLost(game, ctx) {
  dimWorld(ctx);
  const x = 390, y = 220, w = 500, h = 280;
  card(ctx, x, y, w, h);
  text(ctx, 'STRIKE SPENT', CANVAS_W / 2, y + 64, 36, GOLD, 'center', true);
  const reason = game.strikeReason === 'caught' ? 'CAUGHT BY A GUARD'
    : game.strikeReason === 'camera' ? 'CAMERA TRIP'
    : game.strikeReason === 'laser' ? 'LASER TRIP' : 'THE HOUSE NOTICED';
  sans(ctx, reason, CANVAS_W / 2, y + 104, 15, '#ff9a7a', 'center', true);
  sans(ctx, 'STRIKES LEFT ' + game.strikes + ' / 3', CANVAS_W / 2, y + 142, 14, CREAM, 'center', true);
  sans(ctx, 'HEAT ' + game.heat + '%', CANVAS_W / 2, y + 168, 14, CREAM, 'center');
  sans(ctx, 'The act restarts. Press Enter.', CANVAS_W / 2, y + 214, 14, CREAM, 'center');
}

function drawVictory(game, ctx) {
  dimWorld(ctx);
  const x = 300, y = 90, w = 680, h = 540;
  card(ctx, x, y, w, h);
  text(ctx, 'CURTAIN CALL', CANVAS_W / 2, y + 70, 44, GOLD, 'center', true);
  sans(ctx, 'The full Score is yours. The house never knew you were there.', CANVAS_W / 2, y + 106, 15, CREAM, 'center');
  for (let i = 0; i < ACT_ITINERARY.length; i++) {
    sans(ctx, '\u2713 ' + (i + 1) + '  ' + ACT_ITINERARY[i].name, CANVAS_W / 2, y + 150 + i * 28, 14, CREAM, 'center');
  }
  sans(ctx, 'SCORE PAGES 5 / 5', CANVAS_W / 2, y + 320, 16, GOLD, 'center', true);
  sans(ctx, 'FINAL SCORE ' + game.score + '   TIME ' + fmtTime(game.totalTime), CANVAS_W / 2, y + 352, 15, CREAM, 'center', true);
  sans(ctx, 'STRIKES SURVIVING ' + game.strikes + ' / 3   HEAT ' + game.heat + '%   TIMES SPOTTED ' + game.spotted, CANVAS_W / 2, y + 382, 14, CREAM, 'center');
  sans(ctx, 'Press Enter to play again', CANVAS_W / 2, y + 440, 15, CREAM, 'center', true);
}

function drawGameOver(game, ctx) {
  dimWorld(ctx);
  const x = 340, y = 200, w = 600, h = 320;
  card(ctx, x, y, w, h);
  text(ctx, 'THE CURTAIN FALLS', CANVAS_W / 2, y + 70, 36, '#c04030', 'center', true);
  sans(ctx, game.loseReason || 'The house caught you.', CANVAS_W / 2, y + 112, 15, CREAM, 'center');
  sans(ctx, 'SCORE ' + game.score + '   SCORE PAGES ' + game.pages + ' / 5', CANVAS_W / 2, y + 152, 14, CREAM, 'center');
  sans(ctx, 'Press Enter to try again, or R to restart the run.', CANVAS_W / 2, y + 210, 14, CREAM, 'center');
}

function drawPaused(game, ctx) {
  dimWorld(ctx);
  text(ctx, 'PAUSED', CANVAS_W / 2, 300, 44, GOLD, 'center', true);
  sans(ctx, 'Press Esc to resume. R restarts the act.', CANVAS_W / 2, 340, 15, CREAM, 'center');
}

// The message line under the goal rows, shown briefly.
function drawMessage(game, ctx) {
  if (!game.message || game.messageT <= 0) return;
  ctx.globalAlpha = Math.min(1, game.messageT);
  sans(ctx, game.message, CANVAS_W / 2, 128, 14, '#ffd24a', 'center', true);
  ctx.globalAlpha = 1;
}

// Main draw dispatch. Screens stack; the world is drawn under overlays.
export function draw(game, ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const screen = game.screens[game.screens.length - 1];
  if (screen === 'title') {
    drawTitle(game, ctx);
    return;
  }
  drawTopBar(game, ctx);
  drawGoalLines(game, ctx);
  drawCampaignPanel(game, ctx);
  drawRightPanel(game, ctx);
  drawWorld(game, ctx, game.view);
  drawMessage(game, ctx);
  if (screen === 'intermission') drawIntermission(game, ctx);
  else if (screen === 'strikeLost') drawStrikeLost(game, ctx);
  else if (screen === 'victory') drawVictory(game, ctx);
  else if (screen === 'gameOver') drawGameOver(game, ctx);
  else if (screen === 'paused') drawPaused(game, ctx);
}
