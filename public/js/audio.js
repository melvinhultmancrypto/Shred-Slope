/* Shred Slope: synthesised sound and a generative soundtrack (Web Audio, no sound files). */
(function () {
  'use strict';
  const SS = window.SS;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Sfx = {
    ctx: null, master: null, sfx: null, musicBus: null, noise: null, loops: {},
    muted: false, sfxOn: true, musicOn: true, mus: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.applyMusic();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        this.ctx = ac;
        this.master = ac.createGain();
        this.master.gain.value = this.muted ? 0 : 0.6;
        this.master.connect(ac.destination);
        this.sfx = ac.createGain();
        this.sfx.gain.value = this.sfxOn ? 0.85 : 0;
        this.sfx.connect(this.master);
        this.musicBus = ac.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.master);
        const len = ac.sampleRate * 2;
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
        this.loops.wind = this.loop('lowpass', 500, 0.6);
        this.loops.carve = this.loop('bandpass', 1200, 0.9);
        this.loops.grind = this.loop('bandpass', 3200, 8);
        this.loops.slide = this.loop('bandpass', 700, 0.7);
        this.applyMusic();
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
      src.connect(f); f.connect(g); g.connect(this.sfx);
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

    silence() { for (const k in this.loops) this.set(k, 0); },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
    },
    setSfx(on) {
      this.sfxOn = on;
      if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
    },
    setMusic(on) {
      this.musicOn = on;
      this.applyMusic();
    },

    // ---------------------------------------------------------------- one-shots
    tone(freq, dur, type = 'sine', vol = 0.2, to = 0, delay = 0, bus) {
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
      o.connect(g); g.connect(bus || this.sfx);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hiss(dur, vol = 0.3, freq = 1000, type = 'lowpass', delay = 0, bus) {
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
      s.connect(f); f.connect(g); g.connect(bus || this.sfx);
      s.start(t, Math.random());
      s.stop(t + dur + 0.05);
    },

    pop() { this.tone(260, 0.16, 'triangle', 0.16, 520); this.hiss(0.15, 0.12, 2400, 'highpass'); },
    land(hard) { this.hiss(hard ? 0.35 : 0.2, hard ? 0.55 : 0.32, 650); this.tone(100, 0.14, 'sine', 0.22, 60); },
    bail() { this.hiss(0.7, 0.65, 420); this.tone(150, 0.5, 'sawtooth', 0.1, 45); },
    trick() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.1, 0, i * 0.06)); },
    perfect() { [784, 1047, 1318, 1568].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.1, 0, i * 0.05)); },
    bank() { this.tone(880, 0.1, 'square', 0.05); this.tone(1318, 0.18, 'square', 0.05, 0, 0.08); },
    token() { this.tone(1568, 0.09, 'sine', 0.12); this.tone(2093, 0.16, 'sine', 0.1, 0, 0.05); },
    beep(hi) { this.tone(hi ? 1046 : 523, hi ? 0.45 : 0.18, 'square', 0.08); },
    finish() { [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.09)); },
    boom() { this.hiss(0.9, 0.35, 300); this.hiss(0.6, 0.12, 4000, 'highpass', 0.15); },

    // ---------------------------------------------------------------- music: a chill night loop
    applyMusic() {
      if (!this.ctx) return;
      const want = this.musicOn && !this.muted;
      const t = this.ctx.currentTime;
      this.musicBus.gain.setTargetAtTime(want ? 0.5 : 0, t, want ? 1.5 : 0.3);
      if (want && !this.mus) {
        const ac = this.ctx;
        const delay = ac.createDelay(1);
        delay.delayTime.value = 0.49;
        const fb = ac.createGain();
        fb.gain.value = 0.32;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        const dry = ac.createGain();
        dry.connect(this.musicBus);
        dry.connect(delay);
        delay.connect(lp); lp.connect(fb); fb.connect(delay);
        const wet = ac.createGain();
        wet.gain.value = 0.35;
        lp.connect(wet); wet.connect(this.musicBus);
        this.mus = { out: dry, step: 0, next: ac.currentTime + 0.15 };
        this.mus.timer = setInterval(() => this.schedule(), 60);
      }
    },

    schedule() {
      const m = this.mus, ac = this.ctx;
      if (!m || !ac) return;
      if (!this.musicOn || this.muted) return;
      const eighth = 60 / 88 / 2;
      while (m.next < ac.currentTime + 0.25) {
        this.step(m.step, m.next);
        m.next += eighth;
        m.step++;
      }
    },

    step(step, t) {
      const ac = this.ctx, out = this.mus.out;
      const bar = Math.floor(step / 8) % 8, s = step % 8;
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]];
      const roots = [33, 29, 36, 31];
      const ch = chords[bar % 4], root = roots[bar % 4];
      const env = (g, a, peak, rel) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
      };
      if (s === 0) {
        // soft pad chord
        for (const n of ch) {
          for (const det of [-6, 6]) {
            const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
            o.type = 'sawtooth';
            o.frequency.value = mtof(n);
            o.detune.value = det;
            f.type = 'lowpass';
            f.frequency.value = 700;
            env(g, 0.6, 0.012, 2.6);
            o.connect(f); f.connect(g); g.connect(out);
            o.start(t); o.stop(t + 3.4);
          }
        }
      }
      const drums = bar >= 2;
      if (drums && (s === 0 || s === 4 || (s === 7 && bar % 2))) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
        env(g, 0.005, 0.32, 0.25);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.35);
      }
      if (drums && (s === 2 || s === 6)) {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = this.noise;
        f.type = 'bandpass';
        f.frequency.value = 1900;
        env(g, 0.003, 0.08, 0.16);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t, Math.random()); src.stop(t + 0.25);
      }
      if (drums && s % 2 === 1) {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = this.noise;
        f.type = 'highpass';
        f.frequency.value = 7500;
        env(g, 0.002, 0.03, 0.05);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t, Math.random()); src.stop(t + 0.1);
      }
      if (s === 0 || s === 3 || s === 6) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = mtof(root + (s === 6 ? 7 : 0));
        env(g, 0.01, 0.12, 0.4);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.5);
      }
      if (bar >= 4 && s % 2 === 0) {
        const n = ch[(step * 3 + bar) % ch.length] + 12;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = mtof(n);
        env(g, 0.005, 0.035, 0.5);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.6);
      }
    },
  };

  SS.Sfx = Sfx;
})();
