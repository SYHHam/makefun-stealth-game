// PROMPT SIDE: sound. One file, one job: every noise the game makes,
// synthesized with the Web Audio API. No audio files, no network.
// Every call is safe when there is no audio device: the context is
// created lazily and every method guards itself.

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  } catch (e) {
    return null;
  }
}

function tone(freq, dur, type, vol, slideTo) {
  const c = ensure();
  if (!c || muted) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(c.currentTime + dur);
  } catch (e) { /* stay silent */ }
}

function noiseBurst(dur, vol, lowpass) {
  const c = ensure();
  if (!c || muted) return;
  try {
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass || 1200;
    const g = c.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  } catch (e) { /* stay silent */ }
}

export const sound = {
  unlock() { ensure(); },
  setMuted(m) { muted = !!m; },
  isMuted() { return muted; },
  // Soft tap for a footstep; louder when sprinting.
  footstep(loud) {
    if (loud) noiseBurst(0.09, 0.16, 900);
    else noiseBurst(0.05, 0.07, 700);
  },
  // A coin clinks on the floorboards.
  coin() {
    tone(2100, 0.12, 'triangle', 0.16, 1500);
    tone(2900, 0.08, 'triangle', 0.08, 2400);
  },
  // A cue fires: a short brass chord.
  cue() {
    tone(220, 0.3, 'triangle', 0.18);
    tone(330, 0.3, 'triangle', 0.14);
    tone(440, 0.35, 'triangle', 0.1);
  },
  // The detection sting: a rising note when a guard turns suspicious.
  sting() {
    tone(180, 0.4, 'sawtooth', 0.12, 520);
  },
  // A page is picked up: a small chime.
  pickup() {
    tone(660, 0.12, 'sine', 0.18);
    tone(990, 0.2, 'sine', 0.14);
  },
  // Caught: a low thud plus a falling tone.
  caught() {
    noiseBurst(0.25, 0.25, 400);
    tone(160, 0.5, 'sawtooth', 0.16, 60);
  },
  // A click on a menu button.
  click() {
    tone(880, 0.06, 'square', 0.08);
  },
  // A door opens when the act is complete.
  fanfare() {
    tone(523, 0.15, 'triangle', 0.16);
    tone(659, 0.15, 'triangle', 0.16);
    tone(784, 0.3, 'triangle', 0.16);
  },
};
