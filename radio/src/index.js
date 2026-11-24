import { DurableObject } from 'cloudflare:workers';
export { Accounts } from './accounts.js';
export { Hub } from './hub.js';

const R2 = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const ARTISTS = [
  { key: 'chandol', json: 'chandol.json', name: 'chandol' },
  { key: 'boywithuke', json: 'boywithuke.json', name: 'BoyWithUke' },
];
const ORIGINS = ['https://chandolwav.pages.dev', 'http://127.0.0.1:8080', 'http://localhost:8080', 'http://127.0.0.1:8427', 'http://localhost:8427'];
const DAY = 24 * 60 * 60 * 1000;
const GAP = 1500;
const MAX_QUEUE = 25;
const MAX_PER_PERSON = 2;
const RECENT = 12;
const CHAT_KEEP = 150;

const tag = (a) => { const raw = a.uid ? 'u' + a.uid : a.cid ? 'c' + a.cid : ''; if (!raw) return ''; if (a.uid) return raw; let h = 2166136261; for (const c of raw) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return 'g' + (h >>> 0).toString(36); };
const fileUrl = (p) => (/^https?:/.test(p) ? p : R2 + '/' + String(p).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/'));
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function allowed(req) {
  const o = req.headers.get('Origin') || '';
  return !o || ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+\.chandolwav\.pages\.dev$/.test(o);
}

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' };
  if (o && allowed(req)) { h['access-control-allow-origin'] = o; h['access-control-allow-headers'] = 'authorization, content-type'; h['access-control-allow-methods'] = 'GET, POST, PUT, OPTIONS'; h['access-control-max-age'] = '86400'; }
  return h;
}

async function api(req, env, url) {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (!allowed(req)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: h });
  const acc = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'));
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    const text = await req.text();
    if (text.length > 3000000) return new Response(JSON.stringify({ error: 'too big' }), { status: 413, headers: h });
    try { body = text ? JSON.parse(text) : {}; } catch (e) { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: h }); }
  }
  const p = url.pathname, m = req.method;
  let r;
  if (p === '/auth/signup' && m === 'POST') r = await acc.signup(body, ip);
  else if (p === '/auth/login' && m === 'POST') r = await acc.login(body, ip);
  else if (p === '/auth/me' && m === 'GET') r = await acc.me(token);
  else if (p === '/auth/logout' && m === 'POST') r = await acc.logout(token);
  else if (p === '/auth/password' && m === 'POST') r = await acc.password(token, body);
  else if (p === '/auth/delete' && m === 'POST') r = await acc.remove(token, body);
  else if (p === '/me/avatar' && m === 'POST') r = await acc.setAvatar(token, body.image, env.IMGBB_KEY, 'avatar');
  else if (p === '/me/banner' && m === 'POST') r = await acc.setAvatar(token, body.image, env.IMGBB_KEY, 'banner');
  else if (p.startsWith('/users/') && m === 'GET' && /^\/users\/[0-9]{1,9}$/.test(p)) r = await acc.profile(p.slice(7));
  else if (p === '/me/profile' && m === 'POST') r = await acc.setProfile(token, body);
  else if (p === '/admin/clear-profile' && m === 'POST') r = await acc.adminClearProfile(token, body);
  else if (p === '/admin/users' && m === 'GET') r = await acc.adminUsers(token, url.searchParams.get('q'));
  else if (p === '/admin/ban' && m === 'POST') r = await acc.adminBan(token, body);
  else if (p === '/admin/delete-user' && m === 'POST') r = await acc.adminDelete(token, body);
  else if (p === '/admin/radio' && m === 'POST') {
    if (!(await acc.requireAdmin(token))) r = { status: 403, body: { error: 'Admins only.' } };
    else {
      const allowedActions = ['skip', 'clear-queue', 'drop', 'delete', 'clear', 'delete-uid'];
      if (!allowedActions.includes(body.action)) r = { status: 400, body: { error: 'Unknown action.' } };
      else { const res = await env.RADIO.get(env.RADIO.idFromName('main')).admin(body); r = { status: res.status, body: { ok: res.ok } }; }
    }
  }
  else if (p === '/me/library' && m === 'GET') r = await acc.getLib(token);
  else if (p === '/me/library' && m === 'PUT') r = await acc.putLib(token, body);
  else r = { status: 404, body: { error: 'not found' } };
  if (r.body && r.body.kick) { await env.RADIO.get(env.RADIO.idFromName('main')).kick(r.body.kick.uid, r.body.kick.ip); delete r.body.kick; }
  return new Response(JSON.stringify(r.body), { status: r.status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/me/') || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/users/')) return api(req, env, url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!allowed(req)) return new Response('forbidden', { status: 403 });
      return env.RADIO.get(env.RADIO.idFromName('main')).fetch(req);
    }
    if (url.pathname === '/admin' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) return new Response('no', { status: 403 });
      if (body.action === 'reset-limits') return new Response(JSON.stringify(await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).resetLimits()), { headers: { 'content-type': 'application/json' } });
      if (body.action === 'set-role') return new Response(JSON.stringify(await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).setRole(Number(body.id), String(body.role || ''))), { headers: { 'content-type': 'application/json' } });
      if (body.action === 'find-user') return new Response(JSON.stringify(await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).findUser(String(body.name || ''))), { headers: { 'content-type': 'application/json' } });
      return env.RADIO.get(env.RADIO.idFromName('main')).admin(body);
    }
    if (url.pathname === '/') return new Response('chandol.wav radio', { headers: { 'content-type': 'text/plain' } });
    return new Response('not found', { status: 404 });
  },
};

export class Radio extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, name TEXT, text TEXT, cid TEXT)`);
    try { this.sql.exec('ALTER TABLE chat ADD COLUMN v INTEGER DEFAULT 0'); } catch (e) {}
    try { this.sql.exec('ALTER TABLE chat ADD COLUMN uid INTEGER DEFAULT 0'); } catch (e) {}
    try { this.sql.exec("ALTER TABLE chat ADD COLUMN av TEXT DEFAULT ''"); } catch (e) {}
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    this.songs = null;
    this.songsAt = 0;
    this.lastMsg = new Map();
  }

  get(k, d) { const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : d; }
  set(k, v) { this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }

  async loadSongs() {
    if (this.songs && Date.now() - this.songsAt < 30 * 60 * 1000) return this.songs;
    const list = [];
    for (const a of ARTISTS) {
      try {
        const r = await fetch(R2 + '/' + a.json, { cf: { cacheTtl: 300 } });
        if (!r.ok) continue;
        const d = await r.json();
        (Array.isArray(d) ? d : d.songs || []).forEach((s, i) => {
          const file = s && (s.file || s.url || s.path);
          const dur = Number(s && s.dur);
          if (!file || !(dur > 5)) return;
          list.push({ key: a.key + ':' + (s.id != null ? s.id : i), name: s.title || s.name || 'Untitled', artist: s.artist || a.name,
            artistKey: a.key, url: fileUrl(file), cover: s.cover ? fileUrl(s.cover) : '', dur, era: s.era || '', status: s.status || '' });
        });
      } catch (e) {}
    }
    if (list.length) { this.songs = list; this.songsAt = Date.now(); }
    return this.songs || [];
  }

  pickRandom(songs) {
    const recent = new Set(this.get('recent', []));
    const queued = new Set(this.get('queue', []).map((q) => q.song.key));
    const pool = songs.filter((s) => !recent.has(s.key) && !queued.has(s.key));
    const from = pool.length ? pool : songs;
    return from[Math.floor(Math.random() * from.length)];
  }

  async advance(at) {
    const songs = await this.loadSongs();
    if (!songs.length) return null;
    const queue = this.get('queue', []);
    let next, by = '';
    if (queue.length) { const q = queue.shift(); next = q.song; by = q.by; this.set('queue', queue); }
    else next = this.pickRandom(songs);
    const recent = this.get('recent', []);
    recent.push(next.key);
    this.set('recent', recent.slice(-RECENT));
    const now = { song: next, by, startedAt: at, skips: [] };
    this.set('now', now);
    return now;
  }

  async current() {
    let now = this.get('now', null);
    const t = Date.now();
    if (!now) return this.advance(t + 500);
    let guard = 0;
    while (t >= now.startedAt + now.song.dur * 1000 + GAP && guard++ < 500) {
      const end = now.startedAt + now.song.dur * 1000 + GAP;
      const hadQueue = this.get('queue', []).length > 0;
      now = await this.advance(t - end > 60 * 60 * 1000 && !hadQueue ? t : end);
      if (!now) return null;
    }
    return now;
  }

  crowd() {
    const seen = new Map();
    for (const w of this.ctx.getWebSockets()) {
      const a = w.deserializeAttachment() || {};
      const k = tag(a) || null;
      if (!k) continue;
      const prev = seen.get(k);
      const me = { k, n: a.name || '', u: a.uid || 0, v: a.admin ? 2 : a.v ? 1 : 0, t: !!a.tuned };
      if (!prev || (me.t && !prev.t) || (me.n && !prev.n)) seen.set(k, me);
    }
    return [...seen.values()].slice(0, 60);
  }

  listeners() { return this.ctx.getWebSockets().filter((w) => w.deserializeAttachment()?.tuned).length; }

  async snapshot() {
    const now = await this.current();
    return { type: 'state', now, queue: this.get('queue', []).map(({ cid, uid, ...q }) => q), listeners: this.listeners(), people: this.ctx.getWebSockets().length, crowd: this.crowd(), serverNow: Date.now() };
  }

  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
  broadcast(msg) { const s = JSON.stringify(msg); for (const ws of this.ctx.getWebSockets()) { try { ws.send(s); } catch (e) {} } }
  async broadcastState() { this.broadcast(await this.snapshot()); await this.schedule(); }

  async schedule() {
    const now = this.get('now', null);
    const times = [];
    if (now && this.ctx.getWebSockets().length) times.push(now.startedAt + now.song.dur * 1000 + GAP);
    times.push(Date.now() + 60 * 60 * 1000);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...times)));
  }

  async alarm() {
    this.sql.exec('DELETE FROM chat WHERE ts < ?', Date.now() - DAY);
    if (this.ctx.getWebSockets().length) await this.broadcastState();
    else await this.schedule();
  }

  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ cid: '', name: '', tuned: false, ip: req.headers.get('cf-connecting-ip') || '' });
    this.send(server, await this.snapshot());
    const since = Date.now() - DAY;
    const rows = this.sql.exec('SELECT id, ts, name, text, v, uid, av FROM (SELECT * FROM chat WHERE ts >= ? ORDER BY id DESC LIMIT ?) ORDER BY id', since, CHAT_KEEP).toArray();
    this.send(server, { type: 'chat-history', messages: rows });
    await this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const me = ws.deserializeAttachment() || {};
    if (m.type === 'hello' || m.type === 'name') {
      if (m.type === 'hello') me.cid = clean(m.cid, 40);
      const acc = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('main'));
      const u = m.token ? await acc.verify(String(m.token)) : null;
      me.banned = await acc.isIpBanned(me.ip);
      if (u) { me.name = u.username; me.uid = u.id; me.v = true; me.admin = !!u.admin; me.av = u.avatar || ''; if (me.admin) me.banned = false; }
      else {
        me.v = false; me.uid = 0; me.admin = false; me.av = '';
        const want = clean(m.name, 24);
        if (want && await acc.taken(want)) { me.name = ''; this.send(ws, { type: 'name-taken', text: '“' + want + '” is someone’s account. Log in, or pick another name.' }); }
        else me.name = want;
      }
      ws.serializeAttachment(me);
      this.send(ws, { type: 'you', name: me.name, verified: !!me.v, admin: !!me.admin, banned: !!me.banned, k: tag(me) });
      await this.broadcastState();
      return;
    }
    if (m.type === 'tune') { me.tuned = !!m.on; ws.serializeAttachment(me); await this.broadcastState(); return; }
    if (m.type === 'sync') { this.send(ws, await this.snapshot()); return; }

    if ((m.type === 'request' || m.type === 'chat') && me.banned) return this.send(ws, { type: 'error', text: 'You’re banned from the radio.' });

    if (m.type === 'request') {
      if (!me.name) return this.send(ws, { type: 'error', text: 'Pick a name first.' });
      const songs = await this.loadSongs();
      const song = songs.find((s) => s.key === m.key);
      if (!song) return this.send(ws, { type: 'error', text: 'That song isn’t on the radio.' });
      const queue = this.get('queue', []);
      const now = await this.current();
      if (queue.length >= MAX_QUEUE) return this.send(ws, { type: 'error', text: 'The queue is full right now. Try again in a bit.' });
      if (queue.filter((q) => q.cid === me.cid).length >= MAX_PER_PERSON) return this.send(ws, { type: 'error', text: 'You already have ' + MAX_PER_PERSON + ' songs in the queue.' });
      if (queue.some((q) => q.song.key === song.key) || (now && now.song.key === song.key)) return this.send(ws, { type: 'error', text: 'That song is already playing or queued.' });
      queue.push({ song, by: me.name, cid: me.cid, uid: me.uid || 0, at: Date.now() });
      this.set('queue', queue);
      this.send(ws, { type: 'ok', text: '“' + song.name + '” is in the queue.' });
      this.addSystem(me.name + ' requested “' + song.name + '”');
      await this.broadcastState();
      return;
    }

    if (m.type === 'unrequest') {
      const queue = this.get('queue', []);
      const i = queue.findIndex((q) => q.song.key === m.key && q.cid === me.cid);
      if (i >= 0) { queue.splice(i, 1); this.set('queue', queue); await this.broadcastState(); }
      return;
    }

    if (m.type === 'skip') {
      if (!me.admin) return this.send(ws, { type: 'error', text: 'Only admins can skip.' });
      const now = await this.current();
      if (!now) return;
      this.addSystem('An admin skipped “' + now.song.name + '”');
      await this.advance(Date.now() + 800);
      await this.broadcastState();
      return;
    }

    if (m.type === 'chat') {
      if (!me.name) return this.send(ws, { type: 'error', text: 'Pick a name first.' });
      const text = clean(m.text, 300);
      if (!text) return;
      const last = this.lastMsg.get(me.cid) || 0;
      if (Date.now() - last < 1200) return this.send(ws, { type: 'error', text: 'Slow down a little.' });
      this.lastMsg.set(me.cid, Date.now());
      const ts = Date.now();
      const v = me.v ? (me.admin ? 2 : 1) : 0;
      const uid = me.uid || 0;
      const av = me.av || '';
      const id = this.sql.exec('INSERT INTO chat (ts, name, text, cid, v, uid, av) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', ts, me.name, text, me.cid, v, uid, av).one().id;
      this.broadcast({ type: 'chat', message: { id, ts, name: me.name, text, v, uid, av } });
      return;
    }
  }

  async admin(b) {
    if (b.action === 'clear') this.sql.exec('DELETE FROM chat');
    else if (b.action === 'delete') this.sql.exec('DELETE FROM chat WHERE id = ?', Number(b.id));
    else if (b.action === 'delete-name') this.sql.exec('DELETE FROM chat WHERE name = ?', String(b.name || ''));
    else if (b.action === 'skip') { const n = await this.current(); if (n) this.addSystem('An admin skipped “' + n.song.name + '”'); await this.advance(Date.now() + 800); }
    else if (b.action === 'delete-uid') this.sql.exec('DELETE FROM chat WHERE uid = ? AND uid != 0', Number(b.uid));
    else if (b.action === 'clear-queue') this.set('queue', []);
    else if (b.action === 'drop') this.set('queue', this.get('queue', []).filter((q) => q.song.key !== b.songKey && q.song.name !== b.songKey));
    else return new Response('unknown action', { status: 400 });
    this.broadcast({ type: 'chat-history', messages: this.sql.exec('SELECT id, ts, name, text, v, uid, av FROM (SELECT * FROM chat WHERE ts >= ? ORDER BY id DESC LIMIT ?) ORDER BY id', Date.now() - DAY, CHAT_KEEP).toArray() });
    await this.broadcastState();
    return new Response('ok');
  }

  async kick(uid, ip) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if ((uid && a.uid === uid) || (ip && a.ip === ip)) {
        a.banned = true; a.name = a.uid === uid ? '' : a.name; a.v = false; a.uid = a.uid === uid ? 0 : a.uid;
        ws.serializeAttachment(a);
        this.send(ws, { type: 'banned' });
      }
    }
    const q = this.get('queue', []);
    this.set('queue', q.filter((x) => !(uid && x.uid === uid)));
    await this.broadcastState();
  }

  addSystem(text) {
    const ts = Date.now();
    const id = this.sql.exec('INSERT INTO chat (ts, name, text, cid) VALUES (?, ?, ?, ?) RETURNING id', ts, '', text, '').one().id;
    this.broadcast({ type: 'chat', message: { id, ts, name: '', text } });
  }

  async webSocketClose(ws) { try { ws.close(); } catch (e) {} await this.broadcastState(); }
  async webSocketError(ws) { await this.broadcastState(); }
}
