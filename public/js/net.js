/* Shred Slope: multiplayer client (talks to server.js over a WebSocket). */
(function () {
  'use strict';
  const SS = window.SS;

  class Net {
    constructor(handlers) {
      this.h = handlers;
      this.ws = null;
      this.open = false;
    }

    static online() {
      return location.protocol === 'http:' || location.protocol === 'https:';
    }

    static async servers() {
      const r = await fetch('/api/servers', { cache: 'no-store' });
      if (!r.ok) throw new Error('No server');
      const j = await r.json();
      if (!j || !Array.isArray(j.servers)) throw new Error('No server');
      return j.servers;
    }

    connect(serverId, name, color) {
      this.leave();
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?server=' + serverId;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.open = true;
        this.send({ t: 'hello', name, color });
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (this.ws === ws) this.h.message(m);
      };
      ws.onclose = (e) => {
        const wasOpen = this.open;
        this.open = false;
        if (this.ws === ws) {
          this.ws = null;
          this.h.close(e, wasOpen);
        }
      };
      ws.onerror = () => {};
    }

    send(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }

    leave() {
      const ws = this.ws;
      this.ws = null;
      this.open = false;
      if (ws) {
        try { ws.close(1000); } catch (e) { /* ignore */ }
      }
    }
  }

  SS.Net = Net;
})();
