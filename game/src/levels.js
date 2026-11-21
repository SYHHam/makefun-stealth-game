// Level definitions for PROMPT SIDE: five acts in a grand 1890s opera house.
// Each map is a grid of characters. Legend:
//   # wall (blocks movement and sight)
//   . floorboards
//   , deep shadow floor (dark, hard to be seen here)
//   T tall cover, crate or painted flat (blocks movement and sight)
//   l low cover, costume rack or bush (hides a crouched player, does not block sight)
//   L hanging lamp (light source)
//   P player start
//   O objective item
//   X exit
//   V vent (press E to crawl to its pair)
//   D cue desk (press E to refill one Cue token)
// Guards walk in straight lines between consecutive waypoints, so every
// segment of a patrol route must be clear of walls and tall cover.
// Cameras, lasers and lamps are defined per level below the maps.

export const TILE = 32;

export const LEVELS = [
  {
    name: 'Act 1: Half-Hour Call',
    scene: 'Backstage, half an hour to curtain',
    objective: 'Steal one score page, then reach the stage door exit.',
    tint: '#8a6d3b',
    gel: 'amber',
    sceneDuration: 50,
    cueTokens: 3,
    coins: 5,
    map: [
      '########################',
      '#P....#......#.........#',
      '#.....#..l...#....O....#',
      '#..T..#......#.........#',
      '#.....#..T...#....T....#',
      '#..l......#.....#......#',
      '#....#....#.......#....#',
      '#....#....#..T...#.....#',
      '#....#..T....#...#.....#',
      '#.T..#......#..........#',
      '#....#..l...#....T.....#',
      '#....#......#..........#',
      '#..T....#...#....#...X.#',
      '#....#..#...#....#.....#',
      '#..D.#......#....#.....#',
      '########################',
    ],
    guards: [
      { waypoints: [[4, 2], [4, 12]], speed: 55 },
      { waypoints: [[20, 3], [20, 12]], speed: 50 },
    ],
    cameras: [],
    lasers: [],
    vents: [],
    desks: [[3, 14]],
    lamps: [[2, 7], [10, 8], [19, 7]],
  },
  {
    name: 'Act 2: The Garden Scene',
    scene: 'A green gel wash over painted garden flats',
    objective: 'Steal Prompt Book page 1, then reach the stage door exit.',
    tint: '#3f7a4e',
    gel: 'cyan',
    sceneDuration: 45,
    cueTokens: 3,
    coins: 5,
    map: [
      '########################',
      '#P...l....#......#.....#',
      '#........#..T...#..O.V.#',
      '#..T.....#......#......#',
      '#....l...#..l...#..T...#',
      '#........#......#......#',
      '#..#.....#..T...#......#',
      '#..#..T.......,....#...#',
      '#..#.....#..T...#..#...#',
      '#..#..l..#......#..#...#',
      '#..#.....#..T...#..#...#',
      '#..#.....#......#..#...#',
      '#..#..T..#..l...#..#...#',
      '#.V#.....#......#......#',
      '#..D..l.....T......X...#',
      '########################',
    ],
    guards: [
      { waypoints: [[5, 1], [5, 4]], speed: 60 },
      { waypoints: [[17, 2], [17, 10]], speed: 60 },
      { waypoints: [[17, 13], [21, 13]], speed: 55 },
    ],
    cameras: [],
    lasers: [],
    vents: [[2, 13, 21, 2]],
    desks: [[3, 14]],
    lamps: [[5, 3], [15, 6], [20, 10]],
    followspot: { cx: 12, cy: 7, radius: 90, speed: 0.35 },
  },
  {
    name: 'Act 3: Intermission',
    scene: 'The lit foyer, the bar, the chandelier, the crowd',
    objective: 'Steal Prompt Book page 2, then reach the loading dock exit.',
    tint: '#c9a227',
    gel: 'magenta',
    sceneDuration: 45,
    cueTokens: 4,
    coins: 5,
    map: [
      '########################',
      '#P....#.......#.....V..#',
      '#.....#...l...#...O....#',
      '#..T..#.......#........#',
      '#.....#..T....#...T....#',
      '#..l.....#........#....#',
      '#....#...#...T....#....#',
      '#....#.V.#....V...#....#',
      '#....#...#...l....#....#',
      '#.T..#...#........#....#',
      '#....#...#...T....#....#',
      '#....#...#........#....#',
      '#....#...#...l....#....#',
      '#..T.....#........#..X.#',
      '#.VD..l..#...T....#....#',
      '########################',
    ],
    guards: [
      { waypoints: [[2, 2], [4, 2], [4, 4], [2, 4]], speed: 65 },
      { waypoints: [[11, 2], [11, 5]], speed: 65 },
      { waypoints: [[20, 3], [20, 11]], speed: 60 },
    ],
    cameras: [
      { tx: 12, ty: 1, baseAngle: Math.PI / 2, sweep: 1.1, speed: 0.5, range: 190 },
      { tx: 12, ty: 14, baseAngle: -Math.PI / 2, sweep: 1.1, speed: 0.4, range: 190 },
    ],
    lasers: [],
    vents: [[2, 14, 20, 1]],
    desks: [[3, 14]],
    lamps: [[3, 7], [11, 9], [19, 6], [16, 12]],
    crowd: [[10, 5], [10, 7], [11, 6], [17, 6], [17, 8], [19, 7]],
  },
  {
    name: 'Act 4: The Storm',
    scene: 'Strobe lightning, rain on the roof, fog on the boards',
    objective: 'Steal Prompt Book page 3, then reach the stage door exit.',
    tint: '#5a6f8a',
    gel: 'cyan',
    sceneDuration: 40,
    cueTokens: 4,
    coins: 5,
    map: [
      '########################',
      '#P....#.......#.....V..#',
      '#.....#...l...#...O....#',
      '#..T..#.......#........#',
      '#.....#..T....#...T....#',
      '#..l.....#........#....#',
      '#....#...#...T....#....#',
      '#....#.V.#....V...#....#',
      '#....#...#...l....#....#',
      '#.T..#...#........#....#',
      '#....#...#...T....#....#',
      '#....#...#........#....#',
      '#....#...#...l....#....#',
      '#..T.....#........#..X.#',
      '#.VD..l..#...T....#....#',
      '########################',
    ],
    guards: [
      { waypoints: [[2, 2], [4, 2], [4, 4], [2, 4]], speed: 70 },
      { waypoints: [[11, 2], [11, 5]], speed: 70 },
      { waypoints: [[16, 2], [16, 5]], speed: 70 },
      { waypoints: [[20, 3], [20, 11]], speed: 65 },
    ],
    cameras: [
      { tx: 12, ty: 7, baseAngle: 0, sweep: 1.4, speed: 0.6, range: 180 },
    ],
    lasers: [
      { x1: 10, y1: 6, x2: 10, y2: 12, period: 3.2, phase: 0 },
      { x1: 17, y1: 3, x2: 17, y2: 12, period: 4.0, phase: 1.5 },
    ],
    vents: [[2, 14, 20, 1], [7, 7, 14, 7]],
    desks: [[3, 14]],
    lamps: [[3, 7], [11, 9], [19, 6], [16, 12]],
    storm: true,
  },
  {
    name: 'Act 5: Curtain Call',
    scene: 'The fly tower catwalks, high above the stage',
    objective: 'Steal the full Score, then escape through the loading dock.',
    tint: '#a03a3a',
    gel: 'amber',
    sceneDuration: 40,
    cueTokens: 5,
    coins: 6,
    map: [
      '########################',
      '#P....#.......#.....V..#',
      '#.....#...l...#...O....#',
      '#..T..#.......#........#',
      '#.....#..T....#...T....#',
      '#..l.....#........#....#',
      '#....#...#...T....#....#',
      '#....#.V.#....V...#....#',
      '#....#...#...l....#....#',
      '#.T..#...#........#....#',
      '#....#...#...T....#....#',
      '#....#...#........#....#',
      '#....#...#...l....#....#',
      '#..T.....#........#..X.#',
      '#.VD..l..#...T....#....#',
      '########################',
    ],
    guards: [
      { waypoints: [[2, 2], [4, 2], [4, 4], [2, 4]], speed: 75 },
      { waypoints: [[11, 2], [11, 5]], speed: 75 },
      { waypoints: [[16, 2], [16, 5]], speed: 75 },
      { waypoints: [[20, 3], [20, 11]], speed: 75 },
      { waypoints: [[11, 8], [11, 12]], speed: 70 },
    ],
    cameras: [
      { tx: 12, ty: 1, baseAngle: Math.PI / 2, sweep: 1.2, speed: 0.55, range: 200 },
      { tx: 12, ty: 14, baseAngle: -Math.PI / 2, sweep: 1.2, speed: 0.55, range: 200 },
    ],
    lasers: [
      { x1: 10, y1: 6, x2: 10, y2: 12, period: 2.8, phase: 0 },
      { x1: 17, y1: 3, x2: 17, y2: 12, period: 3.4, phase: 1.2 },
      { x1: 10, y1: 7, x2: 13, y2: 7, period: 3.0, phase: 0.8 },
    ],
    vents: [[2, 14, 20, 1]],
    desks: [[3, 14]],
    lamps: [[3, 7], [11, 9], [19, 6], [16, 12]],
  },
];

// Grid helpers shared by every system.

export function tileAt(grid, tx, ty) {
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return '#';
  return grid[ty][tx];
}

export function isSolidChar(ch) {
  return ch === '#' || ch === 'T';
}

export function blocksSightChar(ch) {
  return ch === '#' || ch === 'T';
}

export function isWalkableChar(ch) {
  return !isSolidChar(ch);
}

// Find the first tile holding a character, in tile coordinates.
export function findTile(grid, ch) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ch) return { tx: x, ty: y };
    }
  }
  return null;
}

export function findAllTiles(grid, ch) {
  const out = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === ch) out.push({ tx: x, ty: y });
    }
  }
  return out;
}

// Line of sight between two pixel points, blocked by walls and tall cover.
// Samples along the segment, so a diagonal through a wall corner still counts.
export function hasLineOfSight(grid, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x1 + dx * t) / TILE);
    const ty = Math.floor((y1 + dy * t) / TILE);
    if (blocksSightChar(tileAt(grid, tx, ty))) return false;
  }
  return true;
}

// Is a pixel point inside a solid tile.
export function solidAtPixel(grid, x, y) {
  return isSolidChar(tileAt(grid, Math.floor(x / TILE), Math.floor(y / TILE)));
}

// Light level at a pixel point: 0 is pitch dark, 1 is full lamp light.
// Deep shadow tiles are darkest, lamps add a warm pool around them.
export function lightAt(grid, lamps, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  let light = tileAt(grid, tx, ty) === ',' ? 0.12 : 0.3;
  for (const lamp of lamps) {
    const d = Math.hypot(x - lamp.x, y - lamp.y);
    if (d < 110) light = Math.max(light, 0.95 - (d / 110) * 0.55);
  }
  return Math.min(1, light);
}
