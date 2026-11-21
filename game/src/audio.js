// Synthesized sound for PROMPT SIDE. Everything is Web Audio, no audio files.
// The audio context starts only after a user gesture, so the title screen is
// silent until the player clicks or presses a key.

export function makeAudio() {
  const sys = {
    ctx: null,
    master: null,
    muted: false,
    noiseBuffer: null,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
      return this.muted;
    },

    tone(freq, dur, type, vol, when, slideTo) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (when || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    noise(dur, vol, filterFreq, when, type) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (when || 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type || 'bandpass';
      filter.frequency.value = filterFreq || 800;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    },

    // A guard footstep tick. Volume falls off with distance to the player.
    footstep(dist) {
      if (!this.ctx || this.muted) return;
      const vol = Math.max(0, 0.22 * (1 - dist / 420));
      if (vol <= 0.01) return;
      this.noise(0.07, vol, 300, 0, 'lowpass');
    },

    playerStep(sprinting) {
      this.noise(0.05, sprinting ? 0.12 : 0.05, 500, 0, 'lowpass');
    },

    coin() {
      this.tone(2400, 0.09, 'triangle', 0.18, 0, 1800);
      this.tone(3100, 0.14, 'triangle', 0.12, 0.07, 2600);
    },

    pickup() {
      this.tone(523, 0.12, 'sine', 0.2);
      this.tone(659, 0.12, 'sine', 0.2, 0.09);
      this.tone(784, 0.22, 'sine', 0.22, 0.18);
    },

    vent() {
      this.noise(0.5, 0.14, 240, 0, 'lowpass');
      this.tone(180, 0.4, 'sine', 0.1, 0, 90);
    },

    alarm() {
      this.tone(660, 0.16, 'square', 0.12);
      this.tone(440, 0.16, 'square', 0.12, 0.18);
      this.tone(660, 0.16, 'square', 0.12, 0.36);
    },

    cueBlackout() {
      this.tone(220, 0.7, 'sine', 0.22, 0, 55);
      this.noise(0.6, 0.08, 200, 0, 'lowpass');
    },

    cueThunder() {
      this.noise(1.6, 0.3, 140, 0, 'lowpass');
      this.noise(1.2, 0.18, 900, 0.1, 'bandpass');
      this.tone(70, 1.2, 'sine', 0.25, 0, 38);
    },

    cueFog() {
      this.noise(1.0, 0.12, 500, 0, 'bandpass');
      this.tone(330, 0.5, 'sine', 0.08, 0, 494);
    },

    cueFollowspot() {
      this.tone(880, 0.1, 'triangle', 0.2);
      this.tone(1318, 0.3, 'triangle', 0.18, 0.08);
    },

    sceneShift() {
      this.tone(392, 0.18, 'sine', 0.14);
      this.tone(523, 0.3, 'sine', 0.14, 0.15);
    },

    win() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, i * 0.14));
    },

    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.12, i * 0.18));
    },
  };
  return sys;
}
