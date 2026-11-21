// PROMPT SIDE: input. One file, one job: it tracks the keyboard and the
// mouse and hands the game a clean state each frame. It never decides
// what a key does; main.js reads this state and acts on it.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    // Mouse position in canvas pixels, and a queued click (world target).
    mouse: { x: 0, y: 0, clicked: false, clickX: 0, clickY: 0 },
    // Keys pressed since the last frame was consumed (edge triggered).
    pressed: new Set(),
    attach() {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
          e.preventDefault();
        }
        if (!e.repeat) input.pressed.add(e.code);
        input.keys.add(e.code);
      });
      window.addEventListener('keyup', (e) => {
        input.keys.delete(e.code);
      });
      window.addEventListener('blur', () => {
        input.keys.clear();
      });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        input.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
        input.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      });
      canvas.addEventListener('mousedown', (e) => {
        const r = canvas.getBoundingClientRect();
        input.mouse.clickX = (e.clientX - r.left) * (canvas.width / r.width);
        input.mouse.clickY = (e.clientY - r.top) * (canvas.height / r.height);
        input.mouse.clicked = true;
      });
    },
    // True while the key is held down.
    down(code) {
      return input.keys.has(code);
    },
    // True once, on the frame the key went down. Cleared by endFrame().
    hit(code) {
      return input.pressed.has(code);
    },
    // Swallow an edge-triggered key so a second fixed step in the same
    // frame does not fire it again (for example, a vent teleport).
    consume(code) {
      input.pressed.delete(code);
    },
    // Movement vector from WASD or the arrow keys, normalized.
    moveVector() {
      let x = 0;
      let y = 0;
      if (input.down('KeyA') || input.down('ArrowLeft')) x -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) x += 1;
      if (input.down('KeyW') || input.down('ArrowUp')) y -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.sqrt(2);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    sneaking() {
      return input.down('ShiftLeft') || input.down('ShiftRight');
    },
    sprinting() {
      return input.down('Space');
    },
    // Take the queued click, if any, and clear it.
    takeClick() {
      if (!input.mouse.clicked) return null;
      input.mouse.clicked = false;
      return { x: input.mouse.clickX, y: input.mouse.clickY };
    },
    // Call at the end of each frame so edge-triggered keys fire once.
    endFrame() {
      input.pressed.clear();
    },
  };
  return input;
}
