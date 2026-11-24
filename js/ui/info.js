
import { $, fmt, showAnimated, hideAnimated, el, txt } from '../core/util.js';
import { state, audio, on } from '../core/state.js';
import { releasedOf } from '../core/versions.js';
import { trackerSection } from '../core/tracker.js';
import { play } from '../player/player.js';
import { explicitBadge } from '../core/data.js';
import { albumOf, playList } from '../pages/albums.js';
import { openLyricsPop } from '../lyrics/lyricpop.js';
import { isLiked, toggleLike } from '../core/library.js';
import { addToQueue } from '../player/queue.js';
import { openMenu } from './menu.js';
import { toast } from './toast.js';
import { shareSong } from './share.js';
import { go, path } from '../core/router.js';
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/></svg>';
const QADD_SVG = '<svg viewBox="0 0 24 24"><path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/></svg>';
const PL_SVG = '<svg viewBox="0 0 24 24"><path d="M4 6h11M4 11h11M4 16h7M18 13v8M14 17h8"/></svg>';

const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const LYR_SVG = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const ALB_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>';
const LINK_SVG = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';

let sheet, card, shown = null;

function longDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function ago(iso) {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso + 'T12:00:00')) / 864e5);
  if (days < 0) return 'upcoming';
  if (days < 1) return 'today';
  if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
  const months = Math.round(days / 30.44);
  if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
  const years = Math.floor(days / 365.25);
  const rest = Math.round((days - years * 365.25) / 30.44);
  return years + (years === 1 ? ' year' : ' years') + (rest >= 1 && years < 3 ? ', ' + rest + (rest === 1 ? ' month' : ' months') : '') + ' ago';
}

function fact(grid, label, value, onClick) {
  if (!value) return;
  const row = el('div', 'ifact');
  row.appendChild(txt('span', 'ifl', label));
  const v = onClick ? txt('button', 'ifv link', value) : txt('span', 'ifv', value);
  if (onClick) { v.type = 'button'; v.onclick = onClick; }
  row.appendChild(v);
  grid.appendChild(row);
}

const VERS_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>';

function versionRow(v, viewing, featured) {
  const isCur = state.tracks[state.cur] === v;
  const playing = isCur && !audio.paused;
  const row = el(featured ? 'div' : 'li', featured ? 'ivfeat' + (v.meta ? ' rel' : '') : 'ivrow');
  if (v === viewing) row.classList.add('viewing');
  if (isCur) row.classList.add('playing');

  const body = el('button', 'ivbody');
  body.type = 'button';
  body.title = v === viewing ? 'You are viewing this version' : 'Show this version';
  const th = el('span', 'ivth');
  if (v.cover) { const i = el('img'); i.alt = ''; i.loading = 'lazy'; i.src = v.cover; i.onerror = () => i.remove(); th.appendChild(i); }
  body.appendChild(th);
  const tx = el('span', 'ivtx');
  tx.appendChild(txt('span', 'ivlabel', featured ? (v.meta ? 'Released version' : 'Main version') : v.vlabel));
  tx.appendChild(txt('b', null, v.name));
  const subBits = v.meta
    ? [v.meta.album + (v.meta.albumType && v.meta.albumType !== 'Album' ? ' (' + v.meta.albumType + ')' : ''), v.year]
    : [v.status || 'Unreleased', v.era ? v.era + ' era' : ''];
  if (v === viewing) subBits.push('viewing');
  tx.appendChild(txt('span', 'ivsubt', subBits.filter(Boolean).join(' \u00b7 ')));
  body.appendChild(tx);
  body.onclick = () => { if (v !== viewing) render(v, 'versions'); };
  row.appendChild(body);

  if (v.dur) row.appendChild(txt('span', 'ivdur', fmt(v.dur)));
  const pb = el('button', 'ivplay', playing ? PAUSE_SVG : PLAY_SVG);
  pb.type = 'button';
  pb.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + v.name);
  pb.onclick = () => {
    if (isCur) { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); return; }
    state.queue = null;
    play(state.tracks.indexOf(v));
  };
  row.appendChild(pb);
  return row;
}

function goAlbum(a) {
  closeInfo();
  if (!$('ov').hidden) $('ovClose').click();
  go('/album/' + a.key);
}

function render(t, focus) {
  const keep = shown === t ? card.scrollTop : 0;
  card.textContent = '';
  const m = t.meta || {};
  const a = albumOf(t);
  const isCur = state.tracks[state.cur] === t;

  const x = el('button', 'x', '&times;');
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = closeInfo;
  card.appendChild(x);

  const top = el('div', 'itop');
  const cv = el('div', 'icover');
  if (t.cover || m.artwork) {
    const img = el('img');
    img.alt = ''; img.src = t.cover || m.artwork;
    img.onerror = () => { if (m.artwork && img.src !== m.artwork) img.src = m.artwork; else img.remove(); };
    cv.appendChild(img);
  }
  top.appendChild(cv);
  const head = el('div', 'ihead');
  head.appendChild(txt('span', 'ikicker', 'Song info'));
  head.appendChild(txt('h2', 'ititle', t.name));
  const by = el('p', 'iby');
  const badge = explicitBadge(t);
  if (badge) by.appendChild(badge);
  by.appendChild(document.createTextNode(t.artist));
  head.appendChild(by);
  const chips = el('div', 'ichips');
  const status = t.meta ? 'Released' : (t.status || 'Unreleased');
  chips.appendChild(txt('span', 'ichip ' + (t.meta ? 'ok' : 'warn'), status));
  if (t.explicit) chips.appendChild(txt('span', 'ichip', 'Explicit'));
  if (m.genre) chips.appendChild(txt('span', 'ichip', m.genre));
  if (t.vgroup) {
    const vc = el('button', 'ichip vers', VERS_SVG + t.vgroup.length + ' versions');
    vc.type = 'button';
    vc.onclick = () => { const s = $('iVersions'); if (s) card.scrollTo({ top: s.offsetTop - 16, behavior: 'smooth' }); };
    chips.appendChild(vc);
  }
  head.appendChild(chips);
  top.appendChild(head);
  card.appendChild(top);

  const acts = el('div', 'iacts');
  const playing = isCur && !audio.paused;
  const pb = el('button', 'ibtn2 pri', (playing ? PAUSE_SVG : PLAY_SVG) + (playing ? 'Pause' : isCur ? 'Resume' : 'Play'));
  pb.type = 'button';
  pb.onclick = () => {
    if (isCur) { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); render(t); return; }
    if (a && a.tracks.includes(t)) playList(a.tracks, t, false, a.name); else { state.queue = null; play(state.tracks.indexOf(t)); }
    render(t);
  };
  acts.appendChild(pb);
  const lb = el('button', 'ibtn2', LYR_SVG + 'Lyrics');
  lb.type = 'button';
  lb.title = isCur ? 'Show lyrics' : 'Play and show lyrics';
  lb.onclick = () => {
    if (!isCur) { if (a && a.tracks.includes(t)) playList(a.tracks, t, false, a.name); else play(state.tracks.indexOf(t)); }
    closeInfo();
    if (!$('ov').hidden) return;
    setTimeout(openLyricsPop, 60);
  };
  acts.appendChild(lb);
  const liked = isLiked(t);
  const hb = el('button', 'ibtn2 icon heart' + (liked ? ' liked' : ''), HEART_SVG);
  hb.type = 'button';
  hb.title = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
  hb.setAttribute('aria-pressed', liked ? 'true' : 'false');
  hb.onclick = () => { toast(toggleLike(t) ? 'Added to Liked Songs' : 'Removed from Liked Songs'); };
  acts.appendChild(hb);
  const qb = el('button', 'ibtn2 icon', QADD_SVG);
  qb.type = 'button'; qb.title = 'Add to queue'; qb.setAttribute('aria-label', 'Add to queue');
  qb.onclick = () => { addToQueue(t); toast('Added to queue'); };
  acts.appendChild(qb);
  const pb2 = el('button', 'ibtn2 icon', PL_SVG);
  pb2.type = 'button'; pb2.title = 'Add to playlist'; pb2.setAttribute('aria-label', 'Add to playlist');
  pb2.onclick = () => openMenu(t, pb2, { page: 'playlists' });
  acts.appendChild(pb2);
  if (a) {
    const ab = el('button', 'ibtn2', ALB_SVG + (a.type === 'Era' ? 'Era' : a.type === 'Single' ? 'Single' : 'Album'));
    ab.type = 'button';
    ab.onclick = () => goAlbum(a);
    acts.appendChild(ab);
  }
  if (m.link) {
    const lk = el('a', 'ibtn2', LINK_SVG + 'Apple Music');
    lk.href = m.link; lk.target = '_blank'; lk.rel = 'noopener';
    acts.appendChild(lk);
  }
  const cp = el('button', 'ibtn2 icon', COPY_SVG);
  cp.type = 'button'; cp.title = 'Copy song name'; cp.setAttribute('aria-label', 'Copy song name');
  cp.onclick = () => {
    const text = t.artist + ' – ' + t.name;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => {
      cp.classList.add('done'); cp.title = 'Copied!';
      setTimeout(() => { cp.classList.remove('done'); cp.title = 'Copy song name'; }, 1400);
    }).catch(() => {});
  };
  acts.appendChild(cp);
  const sb = el('button', 'ibtn2 ishare', '<svg viewBox="0 0 24 24"><path d=\"M12 15V3M7 8l5-5 5 5\"/><path d=\"M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7\"/></svg><span>Share</span>');
  sb.type = 'button'; sb.title = 'Share a link to this song';
  sb.onclick = () => shareSong(t);
  acts.insertBefore(sb, cp);
  card.appendChild(acts);

  if (t.vgroup) {
    const sec = el('section', 'ivers');
    sec.id = 'iVersions';
    const h = el('h3', 'isec', VERS_SVG + 'Versions');
    h.appendChild(txt('span', 'ivcount', String(t.vgroup.length)));
    sec.appendChild(h);
    const rel = releasedOf(t);
    const top = rel || t.vgroup[0];
    sec.appendChild(versionRow(top, t, true));
    const rest = t.vgroup.filter((v) => v !== top);
    if (rest.length) {
      sec.appendChild(txt('span', 'ivsub', rel ? 'Other versions' : 'Other takes'));
      const ul = el('ul', 'ivlist');
      rest.forEach((v) => ul.appendChild(versionRow(v, t, false)));
      sec.appendChild(ul);
    }
    card.appendChild(sec);
  }

  const grid = el('div', 'ifacts');
  if (m.album) {
    fact(grid, m.albumType === 'Single' ? 'Single' : m.albumType === 'EP' ? 'EP' : 'Album', m.album, a ? () => goAlbum(a) : null);
    if (m.trackNumber) fact(grid, 'Track', m.trackNumber + (m.trackCount ? ' of ' + m.trackCount : ''));
    fact(grid, 'Released', longDate(m.releaseDate) + (m.releaseDate ? '  ·  ' + ago(m.releaseDate) : ''));
    if (m.albumReleaseDate && m.albumReleaseDate !== m.releaseDate) {
      fact(grid, (m.albumType === 'EP' ? 'EP' : 'Album') + ' out', longDate(m.albumReleaseDate));
    }
  } else if (t.era) {
    fact(grid, 'Era', t.era, a ? () => goAlbum(a) : null);
  }
  fact(grid, 'Length', t.dur ? fmt(t.dur) : '');
  fact(grid, 'Genre', m.genre);
  fact(grid, 'Status', status);
  if (m.appearsOn && m.appearsOn.length > 1) {
    fact(grid, 'Also on', m.appearsOn.filter((r) => r.album !== m.album || r.type !== m.albumType)
      .map((r) => r.album + (r.type === 'Album' ? '' : ' (' + r.type + ')')).join(', '));
  }
  card.appendChild(grid);

  const tks = trackerSection(t, {
    play: (x) => { state.queue = null; state.queueName = ''; state.lastCtx = null; play(state.tracks.indexOf(x)); },
    info: (x) => render(x),
  });
  if (tks) card.appendChild(tks);

  if (a && a.tracks.length > 1) {
    card.appendChild(txt('h3', 'isec', (a.type === 'Era' ? 'More from the ' : 'More from ') + a.name + (a.type === 'Era' ? ' era' : '')));
    const ul = el('ul', 'imore');
    a.tracks.filter((x) => x !== t).slice(0, 8).forEach((o) => {
      const li = el('li');
      const b = el('button', 'imorebtn');
      b.type = 'button';
      const th = el('span', 'imth');
      if (o.cover) { const i = el('img'); i.alt = ''; i.loading = 'lazy'; i.src = o.cover; i.onerror = () => i.remove(); th.appendChild(i); }
      b.appendChild(th);
      const mt = el('span', 'imtx');
      mt.appendChild(txt('b', null, o.name));
      mt.appendChild(txt('span', null, o.meta ? (o.meta.trackNumber ? 'Track ' + o.meta.trackNumber : 'Released') : (o.status || 'Unreleased')));
      b.appendChild(mt);
      b.onclick = () => render(o);
      b.ondblclick = () => playList(a.tracks, o);
      li.appendChild(b);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (a.tracks.length > 9) {
      const all = txt('button', 'iall', 'See all ' + a.tracks.length + ' songs →');
      all.type = 'button';
      all.onclick = () => goAlbum(a);
      card.appendChild(all);
    }
  }
  const vs = focus === 'versions' && $('iVersions');
  card.scrollTop = vs ? Math.max(0, vs.offsetTop - 16) : keep;
  shown = t;
}

export function openInfo(t, focus) {
  if (!t) return;
  render(t, focus);
  showAnimated(sheet);
  document.body.style.overflow = 'hidden';
}

export function closeInfo() {
  if (sheet.hidden) return;
  shown = null;
  hideAnimated(sheet, 260);
  document.body.style.overflow = '';
}

export function initInfo() {
  sheet = $('info');
  card = $('infoCard');
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeInfo(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) { if (document.querySelector('.cmenu')) return; e.stopPropagation(); closeInfo(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'i' || e.key === 'I') && state.tracks[state.cur]) {
      if (sheet.hidden) openInfo(state.tracks[state.cur]); else closeInfo();
    }
  }, true);
  const refresh = () => {
    const c = state.tracks[state.cur];
    if (shown && !sheet.hidden && (c === shown || (shown.vgroup && shown.vgroup.includes(c)))) render(shown);
  };
  audio.addEventListener('play', refresh);
  audio.addEventListener('pause', refresh);
  on('trackchange', () => { if (shown && !sheet.hidden && shown.vgroup) render(shown); });
  on('library', () => { if (shown && !sheet.hidden) render(shown); });
}
