/* Shred Slope: synthesised sound (Web Audio, no sound files). */
(function () {
  'use strict';
  const SS = window.SS;

  const Sfx = {
    ctx: null, master: null, noise: null, loops: {},
    muted: false,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        this.ctx = ac;
        this.master = ac.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(ac.destination);
        const len = ac.sampleRate * 2;
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
        this.loops.wind = this.loop('lowpass', 500, 0.6);
        this.loops.carve = this.loop('bandpass', 1200, 0.9);
        this.loops.grind = this.loop('bandpass', 3200, 8);
      } catch (e) {
        this.ctx = null;
      }
    },

    loop(type, freq, q) {
      const ac = this.ctx;
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(0, Math.random() * 1.5);
      return { f, g };
    },

    set(name, level, freq) {
      if (!this.ctx) return;
      const l = this.loops[name];
      const t = this.ctx.currentTime;
      l.g.gain.setTargetAtTime(level, t, 0.07);
      if (freq) l.f.frequency.setTargetAtTime(freq, t, 0.1);
    },

    silence() {
      for (const k in this.loops) this.set(k, 0);
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    },

    tone(freq, dur, type = 'sine', vol = 0.2, to = 0, delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hiss(dur, vol = 0.3, freq = 1000, type = 'lowpass', delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const s = ac.createBufferSource();
      s.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
    },

    pop() { this.tone(260, 0.16, 'triangle', 0.16, 520); this.hiss(0.15, 0.12, 2400, 'highpass'); },
    land(hard) { this.hiss(hard ? 0.35 : 0.2, hard ? 0.55 : 0.32, 650); this.tone(100, 0.14, 'sine', 0.22, 60); },
    bail() { this.hiss(0.7, 0.65, 420); this.tone(150, 0.5, 'sawtooth', 0.1, 45); },
    trick() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.1, 0, i * 0.06)); },
    bank() { this.tone(880, 0.1, 'square', 0.06); this.tone(1318, 0.18, 'square', 0.06, 0, 0.08); },
    beep(hi) { this.tone(hi ? 1046 : 523, hi ? 0.45 : 0.18, 'square', 0.08); },
    finish() { [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.09)); },
  };

  SS.Sfx = Sfx;
})();
