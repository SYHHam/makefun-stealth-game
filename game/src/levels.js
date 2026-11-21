// PROMPT SIDE: level data for the five acts.
// One file, one job: it only describes the opera house. No drawing, no
// input, no sound. Every act is a 24 by 16 tile stage. Tiles:
//   '#' wall (blocks movement and sight)
//   'C' tall crate (blocks movement and sight, good cover)
//   'c' low cover (blocks movement; hides a sneaking player)
//   'L' lamp (bright light, raises visibility)
//   'D' deep shadow (dark, hard to be seen)
//   '.' floor
// Guards, cameras, lasers, vents, the objective and the exit are placed
// in tile coordinates and converted to pixels by the game.

export const TILE = 32;
export const COLS = 24;
export const ROWS = 16;

export const LEVELS = [
  {
    name: 'HALF-HOUR CALL',
    scene: 'Backstage, half an hour to curtain',
    goal: 'Steal one score page, then reach the stage door exit.',
    actGoal: 'Steal one score page, then reach the stage door exit.',
    gel: 'amber',
    fog: false,
    coins: 2,
    cueTokens: 4,
    grid: [
      '########################',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c.........#',
      '#..####................#',
      '#..................L...#',
      '#....c.......c.........#',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c......L..#',
      '#......................#',
      '#..####................#',
      '#......................#',
      '########################',
    ],
    spawn: { x: 2, y: 13 },
    objective: { x: 20, y: 2, label: 'score page' },
    exit: { x: 21, y: 13, label: 'stage door' },
    guards: [
      { name: 'Stagehand', x: 6, y: 3, waypoints: [[6, 3], [6, 10], [12, 10], [12, 3]], speed: 1.1, cone: 5, color: 'amber' },
      { name: 'Dresser', x: 17, y: 8, waypoints: [[17, 8], [17, 3], [20, 3], [20, 12]], speed: 0.9, cone: 5, color: 'cyan' },
    ],
    cameras: [],
    lasers: [],
    vents: [{ a: { x: 3, y: 7 }, b: { x: 20, y: 7 } }],
  },
  {
    name: 'THE GARDEN SCENE',
    scene: 'A green gel wash over painted garden flats',
    goal: 'Steal Prompt Book page 1, then reach the stage door exit.',
    actGoal: 'Steal Prompt Book page 1, then reach the stage door exit.',
    gel: 'green',
    fog: false,
    coins: 3,
    cueTokens: 4,
    grid: [
      '########################',
      '#......................#',
      '#..c.....L......c......#',
      '#......................#',
      '#....C.......C.........#',
      '#......####............#',
      '#..c...............L...#',
      '#....C.......C.........#',
      '#......................#',
      '#..L.....c......C......#',
      '#......................#',
      '#....c.......c......L..#',
      '#......................#',
      '#......####............#',
      '#..c...................#',
      '########################',
    ],
    spawn: { x: 2, y: 13 },
    objective: { x: 20, y: 2, label: 'Prompt Book page 1' },
    exit: { x: 21, y: 13, label: 'stage door' },
    guards: [
      { name: 'Stagehand', x: 6, y: 3, waypoints: [[6, 3], [6, 11], [11, 11], [11, 3]], speed: 1.2, cone: 5, color: 'amber' },
      { name: 'Dresser', x: 14, y: 6, waypoints: [[14, 6], [14, 12], [19, 12], [19, 6]], speed: 1.0, cone: 5, color: 'magenta' },
      { name: 'Stage Manager', x: 18, y: 10, waypoints: [[18, 10], [10, 10], [10, 5], [18, 5]], speed: 1.1, cone: 6, color: 'cyan' },
    ],
    cameras: [
      { x: 12, y: 1, dir: 90, sweep: 60, range: 6, color: 'amber' },
    ],
    lasers: [],
    vents: [{ a: { x: 3, y: 7 }, b: { x: 20, y: 7 } }],
  },
  {
    name: 'INTERMISSION',
    scene: 'The lit foyer, the bar, the chandelier, the crowd',
    goal: 'Steal Prompt Book page 2, then reach the loading dock exit.',
    actGoal: 'Steal Prompt Book page 2, then reach the loading dock exit.',
    gel: 'warm',
    fog: false,
    coins: 3,
    cueTokens: 3,
    grid: [
      '########################',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c.....L...#',
      '#..####................#',
      '#......................#',
      '#....D.......D.........#',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c......L..#',
      '#......................#',
      '#..####................#',
      '#....D.......D.........#',
      '########################',
    ],
    spawn: { x: 2, y: 13 },
    objective: { x: 20, y: 2, label: 'Prompt Book page 2' },
    exit: { x: 21, y: 13, label: 'loading dock' },
    guards: [
      { name: 'Usher', x: 5, y: 4, waypoints: [[5, 4], [5, 11], [10, 11], [10, 4]], speed: 1.1, cone: 5, color: 'magenta' },
      { name: 'Stagehand', x: 13, y: 3, waypoints: [[13, 3], [13, 10], [18, 10], [18, 3]], speed: 1.0, cone: 5, color: 'amber' },
      { name: 'Dresser', x: 19, y: 9, waypoints: [[19, 9], [12, 9], [12, 13], [19, 13]], speed: 1.2, cone: 5, color: 'cyan' },
    ],
    cameras: [
      { x: 8, y: 1, dir: 90, sweep: 70, range: 6, color: 'amber' },
      { x: 16, y: 14, dir: 270, sweep: 70, range: 6, color: 'amber' },
    ],
    lasers: [],
    vents: [{ a: { x: 3, y: 7 }, b: { x: 20, y: 7 } }],
  },
  {
    name: 'THE STORM',
    scene: 'Strobe lightning, rain on the roof, fog in the wings',
    goal: 'Steal the storm cue sheet, then reach the trapdoor exit.',
    actGoal: 'Steal the storm cue sheet, then reach the trapdoor exit.',
    gel: 'storm',
    fog: true,
    coins: 4,
    cueTokens: 3,
    grid: [
      '########################',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....D.......D.........#',
      '#..####................#',
      '#..................L...#',
      '#....c.......c.........#',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....D.......D......L..#',
      '#......................#',
      '#..####................#',
      '#....c.......c.........#',
      '########################',
    ],
    spawn: { x: 2, y: 13 },
    objective: { x: 20, y: 2, label: 'storm cue sheet' },
    exit: { x: 21, y: 13, label: 'trapdoor' },
    guards: [
      { name: 'Stagehand', x: 5, y: 3, waypoints: [[5, 3], [5, 11], [9, 11], [9, 3]], speed: 1.2, cone: 5, color: 'cyan' },
      { name: 'Dresser', x: 12, y: 5, waypoints: [[12, 5], [12, 12], [16, 12], [16, 5]], speed: 1.1, cone: 5, color: 'magenta' },
      { name: 'Stage Manager', x: 18, y: 4, waypoints: [[18, 4], [18, 11], [21, 11], [21, 4]], speed: 1.0, cone: 6, color: 'amber' },
      { name: 'Usher', x: 10, y: 8, waypoints: [[10, 8], [15, 8], [15, 13], [10, 13]], speed: 1.3, cone: 5, color: 'cyan' },
    ],
    cameras: [
      { x: 12, y: 1, dir: 90, sweep: 60, range: 6, color: 'amber' },
    ],
    lasers: [
      { x1: 7, y1: 6, x2: 16, y2: 6, period: 3 },
      { x1: 4, y1: 10, x2: 13, y2: 10, period: 4 },
    ],
    vents: [
      { a: { x: 3, y: 7 }, b: { x: 20, y: 7 } },
      { a: { x: 6, y: 12 }, b: { x: 18, y: 3 } },
    ],
  },
  {
    name: 'CURTAIN CALL',
    scene: 'The fly tower catwalks, high above the stage',
    goal: 'Steal the full Score, then escape through the loading dock.',
    actGoal: 'Steal the full Score, then escape through the loading dock.',
    gel: 'gold',
    fog: false,
    coins: 5,
    cueTokens: 5,
    grid: [
      '########################',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c.........#',
      '#......####............#',
      '#..................L...#',
      '#....D.......D.........#',
      '#......................#',
      '#..C.....L......C......#',
      '#......................#',
      '#....c.......c......L..#',
      '#......................#',
      '#......####............#',
      '#....D.......D.........#',
      '########################',
    ],
    spawn: { x: 2, y: 13 },
    objective: { x: 20, y: 2, label: 'the full Score' },
    exit: { x: 21, y: 13, label: 'loading dock' },
    guards: [
      { name: 'Stagehand', x: 5, y: 3, waypoints: [[5, 3], [5, 11], [9, 11], [9, 3]], speed: 1.2, cone: 5, color: 'amber' },
      { name: 'Dresser', x: 12, y: 4, waypoints: [[12, 4], [12, 12], [16, 12], [16, 4]], speed: 1.1, cone: 5, color: 'magenta' },
      { name: 'Stage Manager', x: 18, y: 3, waypoints: [[18, 3], [18, 10], [21, 10], [21, 3]], speed: 1.0, cone: 6, color: 'cyan' },
      { name: 'Usher', x: 8, y: 8, waypoints: [[8, 8], [16, 8], [16, 13], [8, 13]], speed: 1.3, cone: 5, color: 'magenta' },
    ],
    cameras: [
      { x: 9, y: 1, dir: 90, sweep: 70, range: 6, color: 'amber' },
      { x: 15, y: 14, dir: 270, sweep: 70, range: 6, color: 'amber' },
    ],
    lasers: [
      { x1: 6, y1: 6, x2: 17, y2: 6, period: 3 },
      { x1: 5, y1: 11, x2: 15, y2: 11, period: 4 },
    ],
    vents: [
      { a: { x: 3, y: 7 }, b: { x: 20, y: 7 } },
      { a: { x: 6, y: 12 }, b: { x: 18, y: 3 } },
    ],
  },
];

export const ACT_COUNT = LEVELS.length;

export const ACT_ITINERARY = LEVELS.map((l, i) => ({
  n: i + 1,
  name: l.name,
  scene: l.scene,
}));

export const GADGETS = [
  { id: 'coin', label: 'COIN' },
  { id: 'smoke', label: 'SMOKE' },
  { id: 'lantern', label: 'LANTERN' },
];

// Tile helpers. Coordinates are tile indices; out of bounds counts as wall.
export function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return level.grid[ty][tx];
}

export function isWall(level, tx, ty) {
  return tileAt(level, tx, ty) === '#';
}

export function blocksMove(level, tx, ty) {
  const t = tileAt(level, tx, ty);
  return t === '#' || t === 'C' || t === 'c';
}

export function blocksSight(level, tx, ty) {
  const t = tileAt(level, tx, ty);
  return t === '#' || t === 'C';
}

export function isLamp(level, tx, ty) {
  return tileAt(level, tx, ty) === 'L';
}

export function isShadow(level, tx, ty) {
  return tileAt(level, tx, ty) === 'D';
}

export function isCover(level, tx, ty) {
  return tileAt(level, tx, ty) === 'c';
}

// Pixel center of a tile.
export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

// All lamp tile centers, for the lighting pass.
export function lampTiles(level) {
  const out = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (level.grid[y][x] === 'L') out.push({ x, y });
    }
  }
  return out;
}
