// Keyboard and mouse input for PROMPT SIDE.
// WASD or arrows move, Shift sneaks, Space sprints, E interacts,
// click throws a coin, 1-4 fire cues, Esc pauses, R retries, M mutes.

export function makeInput(canvas, handlers) {
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    sneak: false,
    sprint: false,
    interactPressed: false,
    mouseX: 0,
    mouseY: 0,
    mouseClicked: false,

    consumeInteract() {
      if (this.interactPressed) {
        this.interactPressed = false;
        return true;
      }
      return false;
    },
  };

  const keyMap = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'sneak',
    ShiftRight: 'sneak',
    Space: 'sprint',
  };

  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code] !== undefined) {
      input[keyMap[e.code]] = true;
      e.preventDefault();
    }
    if (e.code === 'KeyE' && !e.repeat) input.interactPressed = true;
    if (handlers.onKey) handlers.onKey(e.code, e.repeat);
  });

  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code] !== undefined) input[keyMap[e.code]] = false;
  });

  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = false;
    input.sneak = input.sprint = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
    input.mouseClicked = true;
    if (handlers.onClick) handlers.onClick(input.mouseX, input.mouseY);
  });

  return input;
}
