/*
 * Shred Slope voice chat: riders on the same multiplayer server talk to each other.
 *
 * Audio goes straight between riders (WebRTC, one connection per pair); the game server only passes the
 * connection details along. Nobody hears you unless you turned voice on, and you only hear riders who did
 * too. Push to talk sends your mic only while you hold the key; open mic sends it all the time.
 * Anyone can be muted on your side with a click.
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});

  class Voice {
    constructor(opts) {
      this.send = opts.send;            // (obj) => void, over the game's WebSocket
      this.onChange = opts.onChange || (() => {});
      this.on = false;
      this.mode = 'ptt';                // 'ptt' | 'open'
      this.talkKey = false;
      this.selfMuted = false;
      this.stream = null;
      this.track = null;
      this.myId = 0;
      this.ice = [{ urls: ['stun:stun.l.google.com:19302'] }];
      this.peers = new Map();           // id -> { pc, audio, analyser, data, level, voice, muted, name, queue }
      this.others = new Map();          // id -> { voice, name } for everyone on the server
      this.muted = new Set();           // names you muted (kept for the session, by name so a rejoin stays muted)
      this.ctx = null;
      this.selfAn = null;
      this.box = null;
      this.error = '';
    }

    static supported() {
      return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
    }

    // a new server: who's here, and the relay settings it hands out
    reset(myId, players, ice) {
      this.stopPeers();
      this.myId = myId;
      if (Array.isArray(ice) && ice.length) this.ice = ice;
      this.others.clear();
      for (const p of players) if (p.id !== myId) this.others.set(p.id, { voice: !!p.voice, name: p.name });
      if (this.on) {
        this.send({ t: 'vc', on: true });
        for (const [id, o] of this.others) if (o.voice) this.connect(id);
      }
      this.onChange();
    }

    enable(mode) {
      this.mode = mode === 'open' ? 'open' : 'ptt';
      this.error = '';
      if (this.on) { this.applyTalk(); this.onChange(); return Promise.resolve(true); }
      // asked twice while the mic is still opening: wait for the first, never open the mic twice
      this.cancelled = false;
      if (!this.opening) this.opening = this.start().finally(() => { this.opening = null; });
      return this.opening;
    }

    async start() {
      if (!Voice.supported()) { this.error = 'Voice chat doesn’t work in this browser.'; this.onChange(); return false; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (e) {
        this.error = e && e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the browser to talk.' : 'No microphone found.';
        this.onChange();
        return false;
      }
      if (this.cancelled) { this.cancelled = false; for (const t of this.stream.getTracks()) t.stop(); this.stream = null; return false; }
      this.track = this.stream.getAudioTracks()[0];
      this.on = true;
      this.audioCtx();
      if (this.ctx) {
        try {
          const src = this.ctx.createMediaStreamSource(this.stream);
          this.selfAn = this.ctx.createAnalyser();
          this.selfAn.fftSize = 256;
          src.connect(this.selfAn);
          this.selfData = new Uint8Array(this.selfAn.fftSize);
        } catch (e) { this.selfAn = null; }
      }
      this.applyTalk();
      this.send({ t: 'vc', on: true });
      for (const [id, o] of this.others) if (o.voice) this.connect(id);
      this.onChange();
      return true;
    }

    disable() {
      if (this.opening) this.cancelled = true; // turned off while the mic was still opening
      if (!this.on) return;
      this.on = false;
      this.send({ t: 'vc', on: false });
      this.stopPeers();
      if (this.stream) for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
      this.track = null;
      this.selfAn = null;
      this.onChange();
    }

    leave() {
      this.stopPeers();
      this.others.clear();
      this.myId = 0;
    }

    audioCtx() {
      if (this.ctx) return this.ctx;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      return this.ctx;
    }

    // is your mic going out right now?
    get talking() { return this.on && !this.selfMuted && (this.mode === 'open' || this.talkKey); }
    applyTalk() { if (this.track) this.track.enabled = this.talking; }
    setTalkKey(down) {
      if (this.talkKey === down) return;
      this.talkKey = down;
      this.applyTalk();
      this.onChange();
    }
    setSelfMuted(m) { this.selfMuted = m; this.applyTalk(); this.onChange(); }

    // ---- other riders
    joined(p) { if (p.id !== this.myId) { this.others.set(p.id, { voice: !!p.voice, name: p.name }); this.onChange(); } }
    left(id) { this.others.delete(id); this.drop(id); this.onChange(); }
    peerVoice(id, on) {
      const o = this.others.get(id);
      if (o) o.voice = on;
      if (on && this.on) this.connect(id);
      if (!on) this.drop(id);
      this.onChange();
    }
    toggleMute(id) {
      const o = this.others.get(id);
      if (!o) return;
      if (this.muted.has(o.name)) this.muted.delete(o.name); else this.muted.add(o.name);
      const p = this.peers.get(id);
      if (p && p.audio) p.audio.muted = this.muted.has(o.name);
      this.onChange();
    }
    isMuted(id) { const o = this.others.get(id); return !!o && this.muted.has(o.name); }

    connect(id) {
      if (!this.on || this.peers.has(id) || id === this.myId) return;
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      const peer = { pc, audio: null, analyser: null, data: null, level: 0, queue: [], state: 'connecting' };
      this.peers.set(id, peer);
      if (this.track) pc.addTrack(this.track, this.stream);
      pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'rtc', to: id, d: { k: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate } }); };
      pc.onconnectionstatechange = () => {
        peer.state = pc.connectionState;
        if (pc.connectionState === 'failed') { this.drop(id); }
        this.onChange();
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        if (!peer.audio) {
          peer.audio = document.createElement('audio');
          peer.audio.autoplay = true;
          peer.audio.setAttribute('playsinline', '');
          this.holder().appendChild(peer.audio);
        }
        peer.audio.srcObject = stream;
        const o = this.others.get(id);
        peer.audio.muted = !!o && this.muted.has(o.name);
        peer.audio.play().catch(() => {});
        if (this.ctx) {
          try {
            const src = this.ctx.createMediaStreamSource(stream);
            peer.analyser = this.ctx.createAnalyser();
            peer.analyser.fftSize = 256;
            src.connect(peer.analyser);
            peer.data = new Uint8Array(peer.analyser.fftSize);
          } catch (err) { peer.analyser = null; }
        }
      };
      // the rider who joined first (lower id) makes the offer, so two offers never cross
      if (this.myId < id) {
        pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this.send({ t: 'rtc', to: id, d: { k: 'sdp', sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription } })).catch(() => this.drop(id));
      }
    }

    async signal(from, d) {
      if (!this.on || !d) return;
      if (!this.peers.has(from)) {
        const o = this.others.get(from);
        if (o) o.voice = true;
        this.connect(from);
      }
      const peer = this.peers.get(from);
      if (!peer) return;
      const pc = peer.pc;
      try {
        if (d.k === 'sdp' && d.sdp) {
          await pc.setRemoteDescription(d.sdp);
          for (const c of peer.queue) await pc.addIceCandidate(c).catch(() => {});
          peer.queue = [];
          if (d.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            this.send({ t: 'rtc', to: from, d: { k: 'sdp', sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription } });
          }
        } else if (d.k === 'ice' && d.c) {
          if (pc.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {});
          else peer.queue.push(d.c);
        }
      } catch (e) { /* a bad message from one rider shouldn't break anything */ }
    }

    drop(id) {
      const p = this.peers.get(id);
      if (!p) return;
      this.peers.delete(id);
      try { p.pc.close(); } catch (e) { /* closed */ }
      if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    }
    stopPeers() { for (const id of [...this.peers.keys()]) this.drop(id); }

    holder() {
      if (!this.box) {
        this.box = document.createElement('div');
        this.box.style.display = 'none';
        document.body.appendChild(this.box);
      }
      return this.box;
    }

    // how loud each rider is right now (0..1), for the little talking lights
    level(an, data) {
      if (!an) return 0;
      an.getByteTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / data.length) * 6);
    }
    levels() {
      const out = new Map();
      for (const [id, p] of this.peers) out.set(id, p.audio && !p.audio.muted ? this.level(p.analyser, p.data) : 0);
      out.set(this.myId, this.talking ? this.level(this.selfAn, this.selfData) : 0);
      return out;
    }
    connected(id) { const p = this.peers.get(id); return !!p && p.state === 'connected'; }
  }

  SS.Voice = Voice;
})();
