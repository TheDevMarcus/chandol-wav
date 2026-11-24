import { DurableObject } from 'cloudflare:workers';

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const CMDS = ['play', 'pause', 'toggle', 'next', 'prev', 'seek', 'volume', 'playTrack', 'take', 'stop', 'shuffle', 'repeat'];

export class Hub extends DurableObject {
  send(ws, m) { try { ws.send(JSON.stringify(m)); } catch (e) {} }
  mine(uid) { return this.ctx.getWebSockets().filter((w) => (w.deserializeAttachment() || {}).uid === uid); }

  list(uid) {
    return this.mine(uid).map((w) => { const a = w.deserializeAttachment(); return { id: a.id, name: a.name, kind: a.kind, state: a.state || null }; });
  }
  push(uid) { const devices = this.list(uid); for (const w of this.mine(uid)) this.send(w, { type: 'devices', devices }); }

  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid: 0 });
    setTimeout(() => { try { if (!(server.deserializeAttachment() || {}).uid) server.close(4001, 'auth timeout'); } catch (e) {} }, 10000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 20000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = ws.deserializeAttachment() || {};

    if (m.type === 'auth') {
      const acc = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('main'));
      const u = await acc.verify(String(m.token || ''));
      if (!u) { this.send(ws, { type: 'auth-failed' }); ws.close(4003, 'not logged in'); return; }
      const id = clean(m.device && m.device.id, 40);
      if (!id) { ws.close(4000, 'no device id'); return; }
      for (const w of this.mine(u.id)) { if (w !== ws && w.deserializeAttachment().id === id) { try { w.close(4002, 'replaced'); } catch (e) {} } }
      ws.serializeAttachment({ uid: u.id, id, name: clean(m.device.name, 40) || 'Device', kind: m.device.kind === 'phone' ? 'phone' : m.device.kind === 'tablet' ? 'tablet' : 'computer', state: null });
      this.send(ws, { type: 'ready' });
      this.push(u.id);
      return;
    }
    if (!me.uid) return;

    if (m.type === 'state') {
      const s = m.state || {};
      me.state = s.key ? {
        key: clean(s.key, 60), name: clean(s.name, 120), artist: clean(s.artist, 60), cover: clean(s.cover, 400),
        dur: Number(s.dur) || 0, pos: Number(s.pos) || 0, playing: !!s.playing, vol: Math.max(0, Math.min(1, Number(s.vol) || 0)),
        shuffle: !!s.shuffle, repeat: clean(s.repeat, 8), at: Date.now(),
      } : null;
      ws.serializeAttachment(me);
      this.push(me.uid);
      return;
    }
    if (m.type === 'rename') { me.name = clean(m.name, 40) || me.name; ws.serializeAttachment(me); this.push(me.uid); return; }
    if (m.type === 'cmd') {
      if (!CMDS.includes(m.cmd)) return;
      const target = this.mine(me.uid).find((w) => w.deserializeAttachment().id === m.to);
      if (!target) return this.send(ws, { type: 'error', text: 'That device went offline.' });
      this.send(target, { type: 'cmd', cmd: m.cmd, arg: m.arg === undefined ? null : m.arg, from: me.id, fromName: me.name });
    }
  }

  async webSocketClose(ws) { const a = ws.deserializeAttachment() || {}; try { ws.close(); } catch (e) {} if (a.uid) this.push(a.uid); }
  async webSocketError(ws) { const a = ws.deserializeAttachment() || {}; if (a.uid) this.push(a.uid); }
}
