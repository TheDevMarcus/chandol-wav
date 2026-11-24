'use strict'

const net = require('net')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const OP_HANDSHAKE = 0
const OP_FRAME = 1
const OP_CLOSE = 2
const OP_PING = 3
const OP_PONG = 4

const MIN_INTERVAL_MS = 3000
const RETRY_MS = 15000
const BURST_COUNT = 3
const BURST_WINDOW_MS = 4000
const BURST_DELAY_MS = 400

function frame(op, data) {
  const json = Buffer.from(JSON.stringify(data))
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

function socketCandidates() {
  if (process.platform === 'win32') {
    return Array.from({ length: 10 }, (_, i) => '\\\\?\\pipe\\discord-ipc-' + i)
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const bases = [process.env.XDG_RUNTIME_DIR, uid !== null ? '/run/user/' + uid : null, process.env.TMPDIR, process.env.TMP, process.env.TEMP, '/tmp']
  const subs = ['', 'app/com.discordapp.Discord', 'app/com.discordapp.DiscordCanary', 'app/dev.vencord.Vesktop', 'snap.discord', 'arRPC']
  const seen = new Set()
  const out = []
  for (let i = 0; i < 10; i++) {
    for (const base of bases) {
      if (!base) continue
      for (const sub of subs) {
        const p = path.join(base, sub, 'discord-ipc-' + i)
        if (seen.has(p)) continue
        seen.add(p)
        try { if (fs.existsSync(p)) out.push(p) } catch {}
      }
    }
  }
  return out
}

class DiscordRpc {
  constructor() {
    this.socket = null
    this.ready = false
    this.connecting = false
    this.clientId = ''
    this.pending = null
    this.last = null
    this.lastKey = null
    this.changes = []
    this.cleared = true
    this.lastSend = 0
    this.retryAt = 0
    this.timer = null
  }

  update(clientId, activity, key) {
    if (!activity) {
      this.cleared = true
      if (!this.ready) {
        this.pending = null
        this.last = null
        return
      }
      clientId = this.clientId
    }
    const songChanged = Boolean(activity) && key !== undefined && key !== this.lastKey
    const resumed = Boolean(activity) && this.cleared
    if (activity) this.cleared = false
    if (activity && key !== undefined) this.lastKey = key
    let delay = 0
    if (songChanged) {
      const now = Date.now()
      this.changes = this.changes.filter(t => now - t < BURST_WINDOW_MS)
      this.changes.push(now)
      if (this.changes.length >= BURST_COUNT) delay = BURST_DELAY_MS
    }
    this.pending = { clientId, activity }
    this.last = activity ? { clientId, activity } : null
    this.schedule(delay, songChanged || resumed || !activity)
  }

  schedule(delay, immediate = false) {
    if (immediate && this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.timer) return
    const wait = immediate ? delay : Math.max(delay, this.lastSend + MIN_INTERVAL_MS - Date.now(), 0)
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, wait)
  }

  async flush() {
    const job = this.pending
    if (!job) return
    if (this.ready && this.clientId !== job.clientId) this.close()
    if (!this.ready) await this.connect(job.clientId)
    if (!this.ready) {
      if (this.pending && this.pending.activity) this.schedule(RETRY_MS)
      return
    }
    const latest = this.pending
    if (!latest) return
    this.pending = null
    this.lastSend = Date.now()
    this.write(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: latest.activity },
      nonce: crypto.randomUUID()
    })
  }

  async connect(clientId) {
    if (this.connecting || Date.now() < this.retryAt) return
    this.connecting = true
    try {
      for (const p of socketCandidates()) {
        try {
          await this.open(p, clientId)
          this.clientId = clientId
          return
        } catch {}
      }
      this.retryAt = Date.now() + RETRY_MS
    } finally {
      this.connecting = false
    }
  }

  open(p, clientId) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(p)
      let buf = Buffer.alloc(0)
      let done = false
      const fail = err => {
        if (done) return
        done = true
        clearTimeout(timeout)
        s.destroy()
        reject(err)
      }
      const timeout = setTimeout(() => fail(new Error('handshake timeout')), 4000)

      s.on('connect', () => s.write(frame(OP_HANDSHAKE, { v: 1, client_id: clientId })))
      s.on('error', err => {
        if (!done) fail(err)
        else this.drop(s)
      })
      s.on('close', () => {
        if (!done) fail(new Error('closed'))
        else this.drop(s)
      })
      s.on('data', chunk => {
        buf = Buffer.concat([buf, chunk])
        while (buf.length >= 8) {
          const op = buf.readInt32LE(0)
          const len = buf.readInt32LE(4)
          if (len < 0 || buf.length < 8 + len) break
          let msg = {}
          try { msg = JSON.parse(buf.subarray(8, 8 + len).toString()) } catch {}
          buf = buf.subarray(8 + len)
          if (op === OP_PING) {
            try { s.write(frame(OP_PONG, msg)) } catch {}
          } else if (op === OP_CLOSE) {
            if (!done) fail(new Error('rejected'))
            else s.destroy()
          } else if (op === OP_FRAME && msg.evt === 'READY' && !done) {
            done = true
            clearTimeout(timeout)
            this.socket = s
            this.ready = true
            resolve()
          }
        }
      })
    })
  }

  drop(s) {
    if (this.socket !== s) return
    this.socket = null
    this.ready = false
    if (this.last && !this.pending) {
      this.pending = this.last
      this.schedule(2000)
    }
  }

  write(op, data) {
    if (!this.socket) return
    try { this.socket.write(frame(op, data)) } catch {}
  }

  close() {
    const s = this.socket
    this.socket = null
    this.ready = false
    if (!s) return
    try { s.write(frame(OP_CLOSE, {})) } catch {}
    s.destroy()
  }

  shutdown() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
    this.last = null
    this.close()
  }
}

const rpc = new DiscordRpc()

function clip(value, max) {
  let s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max)
  if (s.length === 1) s += '\u200b'
  return s
}

function toActivity(p) {
  const title = clip(p.title, 128) || 'Unknown song'
  const artist = clip(p.artist, 128) || 'Unknown artist'
  const activity = {
    type: 2,
    details: title,
    state: artist
  }
  if (p.statusDisplayType === 1 || p.statusDisplayType === 2) activity.status_display_type = p.statusDisplayType
  const start = Math.round(Number(p.start))
  const end = Math.round(Number(p.end))
  if (Number.isFinite(start) && start > 0) {
    activity.timestamps = { start }
    if (Number.isFinite(end) && end > start) activity.timestamps.end = end
  }
  if (typeof p.cover === 'string' && /^https:\/\//i.test(p.cover) && p.cover.length <= 256) {
    activity.assets = { large_image: p.cover }
  }
  return activity
}

function setPresence(payload) {
  if (!payload || typeof payload !== 'object') return
  const clientId = String(payload.clientId || '').trim()
  if (!/^\d{5,25}$/.test(clientId)) return
  const activity = toActivity(payload)
  const key = (payload.id != null ? String(payload.id) : '') + '|' + clip(payload.title, 128) + '|' + clip(payload.artist, 128)
  rpc.update(clientId, activity, key)
}

function clear() {
  rpc.update('', null)
}

function shutdown() {
  rpc.shutdown()
}

module.exports = { setPresence, clear, shutdown }
