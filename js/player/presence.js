import { state, audio, on } from '../core/state.js';

const CLIENTS = {
  chandol: '1560069643568156684',
  boywithuke: '1560142254373605388',
  juice: '1560734064762429485'
};

const STATUS_LINE = { juice: 1 };

const KEY = 'chandol-discord';
const DRIFT_MS = 3000;

export const getDiscord = () => {
  try { const v = localStorage.getItem(KEY); return v == null ? true : v === '1'; } catch (e) { return true; }
};

export const setDiscord = (val) => {
  try { localStorage.setItem(KEY, val ? '1' : '0'); } catch (e) {}
  sync();
};

let bridge = null;
let startedAt = 0;

function clientFor(t) {
  return (t && CLIENTS[t.artistKey]) || '';
}

function total() {
  if (audio.duration > 0 && isFinite(audio.duration)) return audio.duration;
  const t = state.tracks[state.cur];
  return t && t.dur > 0 ? t.dur : 0;
}

function payload(start) {
  const t = state.tracks[state.cur];
  const dur = total();
  return {
    clientId: clientFor(t),
    id: t.id,
    title: t.name,
    artist: t.artist,
    cover: t.coverRemote || t.cover,
    statusDisplayType: STATUS_LINE[t.artistKey] || 0,
    start: start,
    end: dur > 0 ? start + dur * 1000 : 0
  };
}

export function sync() {
  if (!bridge) return;
  const t = state.tracks[state.cur];
  if (!getDiscord() || !t || audio.paused || !clientFor(t) || total() <= 0) {
    if (startedAt) bridge.clear();
    startedAt = 0;
    return;
  }
  startedAt = Date.now() - audio.currentTime * 1000;
  bridge.set(payload(startedAt));
}

export function initPresence() {
  bridge = window.wavDesktop && window.wavDesktop.presence;
  if (!bridge) return;
  on('trackchange', sync);
  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('loadedmetadata', sync);
  audio.addEventListener('seeked', sync);
  audio.addEventListener('timeupdate', () => {
    if (!startedAt || audio.paused) return;
    if (Math.abs(Date.now() - audio.currentTime * 1000 - startedAt) < DRIFT_MS) return;
    sync();
  });
}
