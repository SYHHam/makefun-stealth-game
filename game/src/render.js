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

// Four semantic channels only. RED danger, GOLD goal and chrome,
// CYAN you and your safe state, VIOLET cues and stage machinery.
// Neutral gray is architecture and inert props.
const RED = '#ff3b4e';
const RED_RGB = '255, 59, 78';
const CYAN = '#4dd8e6';
const CYAN_RGB = '77, 216, 230';
const VIOLET = '#9a7ff0';
const VIOLET_RGB = '154, 127, 240';
const AMBER = '#e8a020';
const CHARCOAL = '#2b2733';
const LIT_FLOOR = '#241e2b';
const DARK_FLOOR = '#12101a';
const WALL = '#2a2630';
const CRATE = '#3a3442';
const LOWCOVER = '#2e2a33';

// Cone state, one red family. State is intensity, never hue.
const CONE_STATE = {
  patrol: { fill: 0.14, edge: 0.45 },
  suspicious: { fill: 0.22, edge: 0.9 },
  chase: { fill: 0.30, edge: 1 },
};

// Render-only display state. The sim never sees these.
// Suspicion history for the DETECTION decay ghost (value ~1s ago).
let susHistory = [];
let susHistoryLevel = -1;
// Guard investigate tags: WeakMap keyed by guard object, so a level
// reload drops the old tags on its own.
const guardTags = new WeakMap();

function worstSuspicionLocal(game) {
  let w = 0;
  for (const g of game.guards) w = Math.max(w, g.suspicion);
  return w;
}

function eyesOnPlayer(game) {
  let n = 0;
  for (const g of game.guards) {
    if (g.seesPlayer) n++;
  }
  return n;
}

// DETECTION bucket from the worst guard suspicion only, so the hero
// word, the meter, the sub-line and the badge always agree. The house
// number is shown on its own line under the badge.
function detectionState(game) {
  const worst = worstSuspicionLocal(game);
  let chase = false;
  for (const g of game.guards) if (g.state === 'chase') chase = true;
  if (chase || worst >= 70) return { word: 'ALARM', color: RED, worst };
  if (worst >= 30 || eyesOnPlayer(game) > 0) return { word: 'SUSPICIOUS', color: AMBER, worst };
  return { word: 'QUIET', color: CYAN, worst };
}

function visibilityWord(lux) {
  if (lux >= 0.5) return 'LIT';
  if (lux >= 0.25) return 'DIM';
  return 'DARK';
}

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

// The threat layer: all cone fills go into one offscreen canvas with
// 'lighten' so overlaps never stack brightness, then it is composited
// once. Outlines are stroked on the main canvas after, crisp 1px.
let threatCanvas = null;
function getThreatCanvas() {
  if (!threatCanvas) {
    threatCanvas = document.createElement('canvas');
    threatCanvas.width = CANVAS_W;
    threatCanvas.height = CANVAS_H;
  }
  return threatCanvas;
}

function conePath(ctx, view, x, y, dir, halfAngle, range) {
  const p = view.toScreen(x, y);
  const r = range * view.scale;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, r, dir - halfAngle, dir + halfAngle);
  ctx.closePath();
  return p;
}

function coneStateOf(guard) {
  if (guard.state === 'chase') return CONE_STATE.chase;
  if (guard.state === 'investigate' || guard.state === 'suspicious') return CONE_STATE.suspicious;
  return CONE_STATE.patrol;
}

// Draw every cone: fills into the threat layer, outlines on top.
function drawConeLayer(game, ctx, view) {
  const off = getThreatCanvas();
  const octx = off.getContext('2d');
  octx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  octx.globalCompositeOperation = 'lighten';
  const cones = [];
  // Guard cones.
  for (const g of game.guards) {
    const range = g.coneTiles * TILE * coneRangeFactor(game);
    const half = g.state === 'chase' ? (50 * Math.PI) / 180 : (35 * Math.PI) / 180;
    cones.push({ x: g.x, y: g.y, dir: g.dir, half, range, st: coneStateOf(g), chase: g.state === 'chase' });
  }
  // Camera cones: danger too, same red family, patrol intensity.
  for (const cam of game.cameras) {
    if (game.cueFx.blackout <= 0) {
      cones.push({ x: cam.x, y: cam.y, dir: cam.dir, half: (25 * Math.PI) / 180, range: cam.range, st: CONE_STATE.patrol, chase: false });
    }
  }
  for (const c of cones) {
    // Hot zone: the first 2 tiles, brighter red inside the fill layer.
    conePath(octx, view, c.x, c.y, c.dir, c.half, Math.min(c.range, 2 * TILE));
    octx.fillStyle = 'rgba(' + RED_RGB + ', 0.25)';
    octx.fill();
    conePath(octx, view, c.x, c.y, c.dir, c.half, c.range);
    octx.fillStyle = 'rgba(' + RED_RGB + ', ' + c.st.fill + ')';
    octx.fill();
  }
  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(off, 0, 0);
  // Crisp 1px outlines, then a hatch on alarmed cones.
  for (const c of cones) {
    conePath(ctx, view, c.x, c.y, c.dir, c.half, c.range);
    ctx.strokeStyle = 'rgba(' + RED_RGB + ', ' + c.st.edge + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (c.chase) {
      ctx.save();
      conePath(ctx, view, c.x, c.y, c.dir, c.half, c.range);
      ctx.clip();
      const p = view.toScreen(c.x, c.y);
      const r = c.range * view.scale;
      ctx.strokeStyle = 'rgba(' + RED_RGB + ', 0.35)';
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x - r + i * 18, p.y - r);
        ctx.lineTo(p.x + r + i * 18, p.y + r);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
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

// The right panel: Show Clock, Cue Board, DETECTION, SOUND, the
// campaign tallies, the one-line color key, and the controls.
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
    sans(ctx, cue.key + ' ' + cue.name + (active ? '  *' : ''), x, y + 24 + i * 16, 12, active ? VIOLET : CREAM, 'left', active);
  }
  y += 56 + 3 * 16;
  // DETECTION: the recovery loop, legible at a glance. Hero word and
  // meter track the worst guard suspicion (it rises when seen and
  // decays when hidden); the house number sits under it.
  if (susHistoryLevel !== game.levelIndex) {
    susHistory = [];
    susHistoryLevel = game.levelIndex;
  }
  const det = detectionState(game);
  const worst = det.worst;
  susHistory.push({ t: game.time, v: worst });
  while (susHistory.length > 2 && susHistory[0].t < game.time - 1.5) susHistory.shift();
  let ghostV = null;
  for (let i = susHistory.length - 1; i >= 0; i--) {
    if (game.time - susHistory[i].t >= 0.9) { ghostV = susHistory[i].v; break; }
  }
  const eyes = eyesOnPlayer(game);
  sans(ctx, 'DETECTION', x, y + 6, 13, GOLD, 'left', true);
  ctx.save();
  if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '6px';
  sans(ctx, det.word, x, y + 40, 28, det.color, 'left', true);
  ctx.restore();
  // 10-tick alarm meter.
  const meterX = x;
  const meterW = w - 16;
  const meterY = y + 52;
  const tickW = (meterW - 27) / 10;
  for (let i = 0; i < 10; i++) {
    const tx = meterX + i * (tickW + 3);
    const filled = worst >= (i + 1) * 10;
    ctx.fillStyle = filled ? det.color : '#2a2118';
    ctx.fillRect(tx, meterY, tickW, 10);
    ctx.strokeStyle = GOLD_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, meterY + 0.5, tickW, 10);
  }
  // Decay ghost: where the meter was about a second ago.
  if (ghostV !== null && Math.abs(ghostV - worst) >= 5) {
    const gx = meterX + (ghostV / 100) * meterW;
    ctx.strokeStyle = 'rgba(232, 220, 192, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, meterY - 2);
    ctx.lineTo(gx, meterY + 12);
    ctx.stroke();
  }
  let subLine;
  if (eyes > 0) {
    subLine = 'rising \u00B7 ' + eyes + (eyes === 1 ? ' eye' : ' eyes') + ' on you';
  } else if (worst > 0) {
    subLine = 'falling \u00B7 clear in ' + Math.max(1, Math.ceil(worst / 12)) + 's';
  } else {
    subLine = 'clear \u00B7 no eyes on you';
  }
  sans(ctx, subLine, x, y + 76, 12, eyes > 0 ? '#ff9a7a' : CREAM);
  // HIDDEN / SEEN badge plus the house number.
  const badge = eyes > 0 ? 'SEEN' : 'HIDDEN';
  const badgeColor = eyes > 0 ? RED : CYAN;
  const badgeText = eyes > 0 ? 'SEEN \u00B7 ' + eyes + ' eye' + (eyes === 1 ? '' : 's') : 'HIDDEN';
  ctx.font = 'bold 12px Arial, sans-serif';
  const bw = ctx.measureText(badgeText).width + 16;
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.arc(x + 8, y + 92, 8, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(x + bw - 8, y + 92, 8, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillRect(x + 8, y + 84, bw - 16, 16);
  sans(ctx, badgeText, x + bw / 2, y + 96, 12, '#0d0a08', 'center', true);
  sans(ctx, 'HOUSE ' + game.suspicion + '%', x + bw + 12, y + 96, 12, CREAM, 'left', true);
  y += 112;
  // SOUND: one card, two bars on one axis. Noise is cyan/white,
  // the applause mask is gold. Gold longer than white means masked.
  sans(ctx, 'SOUND', x, y + 6, 13, GOLD, 'left', true);
  const mask = game.cueFx.thunder > 0 ? 1 : 0;
  sans(ctx, 'NOISE', x, y + 26, 11, CREAM, 'left', true);
  bar(ctx, x + 52, y + 18, w - 68, 8, game.player.noise, CYAN);
  sans(ctx, 'MASK', x, y + 44, 11, CREAM, 'left', true);
  bar(ctx, x + 52, y + 36, w - 68, 8, mask, GOLD);
  if (mask > game.player.noise) {
    sans(ctx, 'MASKED', x + w - 16, y + 26, 11, GOLD, 'right', true);
  }
  sans(ctx, 'VISIBILITY: ' + visibilityWord(game.lux), x, y + 62, 11, game.lux >= 0.5 ? '#ff9a7a' : CREAM, 'left', true);
  y += 76;
  sans(ctx, 'Spotted: ' + game.spotted + ' times', x, y + 6, 12, CREAM);
  sans(ctx, 'Coins left: ' + game.coins, x, y + 22, 12, CREAM);
  sans(ctx, 'Goal: steal the score page', x, y + 38, 12, CREAM, 'left', true);
  y += 56;
  // The color key replaces the whole legend. Two short lines: the
  // full key does not fit the panel on one line at a readable size.
  sans(ctx, 'RED = SEEN \u00B7 GOLD = GOAL', x, y + 6, 11, CREAM, 'left', true);
  sans(ctx, 'CYAN = YOU \u00B7 VIOLET = CUE', x, y + 22, 11, CREAM, 'left', true);
  y += 38;
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
  // Floor: light is luminance, not hue. A floor tile near a lamp is
  // lit (#241E2B) with a subtle hatch; far from lamps it is dark
  // (#12101A). Deep shadow is darkest. Architecture is neutral gray.
  ctx.fillStyle = DARK_FLOOR;
  ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
  // Floor grid and tiles.
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const t = level.grid[ty][tx];
      const px = ox + tx * TILE * s;
      const py = oy + ty * TILE * s;
      const w = TILE * s;
      if (t === '#') {
        ctx.fillStyle = WALL;
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = GOLD;
        ctx.fillRect(px, py, w, 2);
      } else if (t === 'C') {
        ctx.fillStyle = CRATE;
        ctx.fillRect(px + 2, py + 2, w - 4, w - 4);
        ctx.fillStyle = GOLD_DIM;
        ctx.fillRect(px + 2, py + 2, w - 4, 3);
        ctx.strokeStyle = '#1a1620';
        ctx.strokeRect(px + 2.5, py + 2.5, w - 5, w - 5);
      } else if (t === 'c') {
        ctx.fillStyle = LOWCOVER;
        ctx.fillRect(px + 3, py + 3, w - 6, w - 6);
        ctx.fillStyle = '#5a5266';
        ctx.fillRect(px + 3, py + 3, w - 6, 3);
      } else if (t === 'D') {
        ctx.fillStyle = DARK_FLOOR;
        ctx.fillRect(px, py, w, w);
      } else {
        // '.' floor and 'L' lamp tiles: lit near a lamp, dark away.
        let lit = t === 'L';
        if (!lit) {
          for (const lamp of game.lamps) {
            const dx = tx - lamp.x;
            const dy = ty - lamp.y;
            if (dx * dx + dy * dy < 9) { lit = true; break; }
          }
        }
        ctx.fillStyle = lit ? LIT_FLOOR : DARK_FLOOR;
        ctx.fillRect(px, py, w, w);
        if (lit) {
          ctx.strokeStyle = 'rgba(232, 220, 192, 0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + w - 4);
          ctx.lineTo(px + w - 4, py + 4);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(232, 220, 192, 0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w, w);
    }
  }
  // Dust motes drifting in the beams, under the entities.
  ctx.fillStyle = 'rgba(232, 200, 120, 0.35)';
  for (let i = 0; i < 24; i++) {
    const mx = ((i * 97 + game.time * 6) % (COLS * TILE));
    const my = ((i * 61 + game.time * 3) % (ROWS * TILE));
    const p = view.toScreen(mx, my);
    ctx.fillRect(p.x, p.y, 1.5, 1.5);
  }
  // A very subtle warm wash, the same for every act: light is
  // luminance here, not hue. It sits under the entities so the
  // cones, guards and player stay crisp on top of it.
  ctx.fillStyle = 'rgba(201, 162, 39, 0.03)';
  ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
  // Fog: a violet wash plus drifting blobs, under the entities.
  if (level.fog || game.cueFx.fog > 0) {
    ctx.fillStyle = 'rgba(' + VIOLET_RGB + ', 0.10)';
    ctx.fillRect(ox, oy, COLS * TILE * s, ROWS * TILE * s);
    ctx.fillStyle = 'rgba(' + VIOLET_RGB + ', 0.08)';
    for (let i = 0; i < 6; i++) {
      const fx = ox + ((i * 173 + game.time * 12) % (COLS * TILE * s));
      const fy = oy + ((i * 131 + game.time * 5) % (ROWS * TILE * s));
      ctx.beginPath();
      ctx.ellipse(fx, fy, 90, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Blackout: the sheet drops to lantern pinpricks, under the entities
  // so the player's cyan ring stays findable in the dark.
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
  // Objective: a gold pulsing diamond with a vertical light shaft.
  // The floating "THE SCORE" label is drawn in the label pass.
  if (!game.objectiveTaken) {
    const o = tileCenter(level.objective.x, level.objective.y);
    const p = view.toScreen(o.x, o.y);
    const pulse = 1 + 0.12 * Math.sin(game.time * 3);
    const shaftW = 14 * s + 6;
    const shaftGrad = ctx.createLinearGradient(0, p.y - 70, 0, p.y);
    shaftGrad.addColorStop(0, 'rgba(201, 162, 39, 0)');
    shaftGrad.addColorStop(1, 'rgba(201, 162, 39, 0.28)');
    ctx.fillStyle = shaftGrad;
    ctx.fillRect(p.x - shaftW / 2, p.y - 70, shaftW, 70);
    const r = 11 * pulse;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f0e6cc';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#8a7a3a';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y + i * 4);
      ctx.lineTo(p.x + 5, p.y + i * 4);
      ctx.stroke();
    }
  }
  // Exit: a gold door arch. Chevrons point out, animated.
  const ex = tileCenter(level.exit.x, level.exit.y);
  const ep = view.toScreen(ex.x, ex.y);
  const open = game.objectiveTaken;
  ctx.strokeStyle = open ? '#ffd24a' : GOLD;
  ctx.lineWidth = 2;
  const er = 12 * s + 4;
  ctx.beginPath();
  ctx.moveTo(ep.x - er, ep.y + er);
  ctx.lineTo(ep.x - er, ep.y - er + 6);
  ctx.arc(ep.x, ep.y - er + 6, er, Math.PI, 0);
  ctx.lineTo(ep.x + er, ep.y + er);
  ctx.closePath();
  ctx.stroke();
  if (open) {
    ctx.fillStyle = 'rgba(201, 162, 39, 0.15)';
    ctx.fill();
  }
  const chevPhase = (game.time * 1.5) % 1;
  for (let i = 0; i < 2; i++) {
    const frac = (chevPhase + i * 0.5) % 1;
    const cx = ep.x + er + 4 + frac * 14;
    ctx.strokeStyle = 'rgba(201, 162, 39, ' + (open ? 1 - frac : 0.5) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, ep.y - 5);
    ctx.lineTo(cx + 5, ep.y);
    ctx.lineTo(cx, ep.y + 5);
    ctx.stroke();
  }
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
  // All cones in one red family, via the threat layer.
  drawConeLayer(game, ctx, view);
  // Cameras: gold bodies, red meter when they are filling.
  for (const cam of game.cameras) {
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
  // Guards: charcoal bodies with a red epaulette, state pip above.
  for (const g of game.guards) {
    const p = view.toScreen(g.x, g.y);
    ctx.fillStyle = CHARCOAL;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Red epaulette on the facing side.
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(g.dir) * 7, p.y + Math.sin(g.dir) * 7, 3, 0, Math.PI * 2);
    ctx.fill();
    // State pip: "?" amber for investigate/suspicious, "!" red for chase.
    let pip = null;
    let pipColor = AMBER;
    if (g.state === 'chase') { pip = '!'; pipColor = RED; }
    else if (g.state === 'investigate' || g.state === 'suspicious') { pip = '?'; pipColor = AMBER; }
    if (pip) {
      sans(ctx, pip, p.x, p.y - 16, 14, pipColor, 'center', true);
    }
    // "WHAT WAS THAT?" tag on the turn to investigate: rises and fades.
    let tag = guardTags.get(g);
    if (!tag) { tag = { prev: g.state, start: -1 }; guardTags.set(g, tag); }
    if (g.state === 'investigate' && tag.prev !== 'investigate') tag.start = game.time;
    tag.prev = g.state;
    if (tag.start >= 0) {
      const age = game.time - tag.start;
      if (age >= 0 && age < 0.9) {
        ctx.globalAlpha = 1 - age / 0.9;
        sans(ctx, '?  WHAT WAS THAT?', p.x, p.y - 30 - (age / 0.9) * 12, 11, AMBER, 'center', true);
        ctx.globalAlpha = 1;
      }
    }
  }
  // The player: always on top of the cones, never under the red wash.
  const pp = view.toScreen(game.player.x, game.player.y);
  // Soft drop shadow and a 12px ghost-light halo.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(pp.x + 2, pp.y + 4, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const halo = ctx.createRadialGradient(pp.x, pp.y, 2, pp.x, pp.y, 21);
  halo.addColorStop(0, 'rgba(' + CYAN_RGB + ', 0.28)');
  halo.addColorStop(1, 'rgba(' + CYAN_RGB + ', 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 21, 0, Math.PI * 2);
  ctx.fill();
  // Body with a 1px dark outline so it separates from the red wash.
  ctx.fillStyle = game.player.hidden ? 'rgba(232, 220, 192, 0.55)' : '#f0e6cc';
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0d0a08';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Persistent 2px cyan ring and a directional facing notch.
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 12, 0, Math.PI * 2);
  ctx.stroke();
  const fx = pp.x + Math.cos(game.player.dir) * 12;
  const fy = pp.y + Math.sin(game.player.dir) * 12;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(fx + Math.cos(game.player.dir) * 6, fy + Math.sin(game.player.dir) * 6);
  ctx.lineTo(fx + Math.cos(game.player.dir + 2.4) * 5, fy + Math.sin(game.player.dir + 2.4) * 5);
  ctx.lineTo(fx + Math.cos(game.player.dir - 2.4) * 5, fy + Math.sin(game.player.dir - 2.4) * 5);
  ctx.closePath();
  ctx.fill();
  // Compass chevron on the ring, pointing at the current objective.
  const target = game.objectiveTaken
    ? tileCenter(level.exit.x, level.exit.y)
    : tileCenter(level.objective.x, level.objective.y);
  const tang = Math.atan2(target.y - game.player.y, target.x - game.player.x);
  const cxp = pp.x + Math.cos(tang) * 18;
  const cyp = pp.y + Math.sin(tang) * 18;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cxp + Math.cos(tang) * 6, cyp + Math.sin(tang) * 6);
  ctx.lineTo(cxp + Math.cos(tang + 2.5) * 5, cyp + Math.sin(tang + 2.5) * 5);
  ctx.lineTo(cxp + Math.cos(tang - 2.5) * 5, cyp + Math.sin(tang - 2.5) * 5);
  ctx.closePath();
  ctx.fill();
  // Carrying the score: a small gold pip rides on the player.
  if (game.objectiveTaken) {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y - 20);
    ctx.lineTo(pp.x + 4, pp.y - 16);
    ctx.lineTo(pp.x, pp.y - 12);
    ctx.lineTo(pp.x - 4, pp.y - 16);
    ctx.closePath();
    ctx.fill();
  }
  // HIDDEN / SEEN pill above the player.
  const pEyes = eyesOnPlayer(game);
  const pBadge = pEyes > 0 ? 'SEEN \u00B7 ' + pEyes : 'HIDDEN';
  const pBadgeColor = pEyes > 0 ? RED : CYAN;
  ctx.font = 'bold 10px Arial, sans-serif';
  const pbw = ctx.measureText(pBadge).width + 12;
  const pby = pp.y - 30;
  ctx.fillStyle = pBadgeColor;
  ctx.beginPath();
  ctx.arc(pp.x - pbw / 2 + 6, pby, 6, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(pp.x + pbw / 2 - 6, pby, 6, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillRect(pp.x - pbw / 2 + 6, pby - 6, pbw - 12, 12);
  sans(ctx, pBadge, pp.x, pby + 3.5, 10, '#0d0a08', 'center', true);
  // "YOU" tag on Act 1 only, while the player is still near the spawn.
  if (game.levelIndex === 0) {
    const spawn = tileCenter(2, 13);
    if (Math.hypot(game.player.x - spawn.x, game.player.y - spawn.y) < 1.5 * TILE) {
      sans(ctx, 'YOU', pp.x, pp.y - 44, 11, CYAN, 'center', true);
    }
  }
  // Noise ring: how far the player's sound travels right now.
  if (game.player.noise > 0.15) {
    const nr = 220 * game.player.noise * view.scale * (0.92 + 0.08 * Math.sin(game.time * 6));
    ctx.strokeStyle = 'rgba(232, 220, 192, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, nr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Floating diegetic labels, drawn last so they stay crisp on top.
  if (!game.objectiveTaken) {
    const o = tileCenter(level.objective.x, level.objective.y);
    const op = view.toScreen(o.x, o.y);
    sans(ctx, 'THE SCORE', op.x, op.y - 26, 12, GOLD, 'center', true);
    // Distance chevron under the label, pointing down at the score.
    const chY = op.y - 18 + Math.sin(game.time * 3) * 2;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(op.x - 5, chY);
    ctx.lineTo(op.x, chY + 4);
    ctx.lineTo(op.x + 5, chY);
    ctx.stroke();
  }
  {
    const ex2 = tileCenter(level.exit.x, level.exit.y);
    const ep2 = view.toScreen(ex2.x, ex2.y);
    sans(ctx, 'STAGE DOOR', ep2.x, ep2.y - 26, 12, open ? '#ffd24a' : GOLD, 'center', true);
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
