import { state } from '../core/state.js';
import { el, txt } from '../core/util.js';
import { go, path } from '../core/router.js';

const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const CHEV_SVG = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const norm = (s) => String(s || '').toLowerCase().replace(/boywithuke:/, '').replace(/[^a-z0-9]/g, '');

let eras = null, loading = null;
export function loadEras() {
  if (eras) return Promise.resolve(eras);
  if (!loading) {
    loading = fetch('data/eras.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((d) => (eras = Array.isArray(d) ? d : []));
  }
  return loading;
}

function cover(src, cls) {
  const box = el('span', cls);
  if (src) {
    const img = el('img');
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.remove();
    img.src = src;
    box.appendChild(img);
  }
  return box;
}
const pretty = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return MONTHS[m - 1] + ' ' + d + ', ' + y;
};

function build(albums) {
  const used = new Set();
  const nodes = eras.map((e) => {
    const a = albums.find((x) => x.artistKey === e.artist && norm(x.name) === norm(e.name));
    if (a) used.add(a);
    const date = (a && a.type !== 'Era' && a.date) || e.released || '';
    return { era: e, album: a, artist: e.artist, date, singles: [] };
  });
  const dated = nodes.filter((n) => n.date);
  albums.filter((a) => a.type === 'Single' && !used.has(a) && a.date).forEach((s) => {
    const home = dated.find((n) => n.artist === s.artistKey && n.date >= s.date)
      || [...dated].reverse().find((n) => n.artist === s.artistKey);
    if (home) home.singles.push(s);
  });
  nodes.forEach((n) => n.singles.sort((x, y) => x.date.localeCompare(y.date)));
  return nodes;
}

function node(n, i, playList) {
  const { era, album: a } = n;
  const li = el('li', 'etl-node enter');
  li.style.setProperty('--i', String(Math.min(i, 16)));
  if (state.tracks[state.cur] && a && a.tracks.includes(state.tracks[state.cur])) li.classList.add('now');

  const when = el('div', 'etl-when');
  if (n.date) {
    when.appendChild(txt('b', null, n.date.slice(0, 4)));
    when.appendChild(txt('span', null, MONTHS[Number(n.date.slice(5, 7)) - 1]));
  } else when.appendChild(txt('span', null, 'early'));
  li.appendChild(when);
  li.appendChild(el('span', 'etl-dot'));

  const card = el('div', 'etl-card');
  const art = cover(a && a.cover, 'etl-art');
  if (a && a.tracks.length) {
    const pb = el('button', 'etl-play', PLAY_SVG);
    pb.type = 'button';
    pb.setAttribute('aria-label', 'Play ' + era.name);
    pb.onclick = (e) => { e.stopPropagation(); playList(a.tracks, null, false, a.name); };
    art.appendChild(pb);
  }
  card.appendChild(art);

  const body = el('div', 'etl-body');
  const top = el('div', 'etl-top');
  top.appendChild(txt('h3', null, era.name));
  const type = a ? (a.type === 'Era' ? 'Unreleased era' : a.type) : 'Era';
  top.appendChild(txt('span', 'etl-type', type));
  body.appendChild(top);

  const facts = [];
  if (a && a.released.length) facts.push(a.released.length + (a.released.length === 1 ? ' song' : ' songs'));
  if (a && a.unreleased.length) facts.push(a.unreleased.length + ' unreleased here');
  if (era.trackerSongs) facts.push(era.trackerSongs + ' in the tracker');
  if (facts.length) body.appendChild(txt('p', 'etl-facts', facts.join(' · ')));
  if (era.note) body.appendChild(txt('p', 'etl-note', era.note));

  if (n.singles.length) {
    const row = el('div', 'etl-singles');
    n.singles.slice(0, 8).forEach((s) => {
      const b = el('button', 'etl-single');
      b.type = 'button';
      b.title = s.name + ' · single · ' + pretty(s.date);
      b.appendChild(cover(s.cover, 'etl-sart'));
      b.appendChild(txt('span', null, s.name));
      b.onclick = (e) => { e.stopPropagation(); go('/album/' + s.key); };
      row.appendChild(b);
    });
    body.appendChild(row);
  }

  const evs = era.events || [];
  if (evs.length) {
    const tg = el('button', 'etl-more', CHEV_SVG + 'Moments');
    tg.type = 'button';
    const ul = el('ul', 'etl-events');
    ul.hidden = true;
    evs.forEach((ev) => {
      const item = el('li');
      item.appendChild(txt('time', null, pretty(ev.date)));
      item.appendChild(txt('span', null, ev.text));
      ul.appendChild(item);
    });
    tg.onclick = (e) => { e.stopPropagation(); ul.hidden = !ul.hidden; tg.classList.toggle('open', !ul.hidden); };
    body.appendChild(tg);
    body.appendChild(ul);
  }
  card.appendChild(body);
  if (a) {
    card.classList.add('link');
    card.tabIndex = 0;
    card.onclick = () => { go('/album/' + a.key); };
    card.onkeydown = (e) => { if (e.key === 'Enter') card.click(); };
  }
  li.appendChild(card);
  return li;
}

export function renderTimeline(root, albums, artistFilter, playList) {
  const wrap = el('div', 'etl');
  root.appendChild(wrap);
  if (!eras) {
    wrap.appendChild(txt('p', 'albempty', 'Loading the timeline…'));
    loadEras().then(() => { wrap.textContent = ''; fill(wrap, albums, artistFilter, playList); });
    return;
  }
  fill(wrap, albums, artistFilter, playList);
}

function fill(wrap, albums, artistFilter, playList) {
  if (!eras.length) { wrap.appendChild(txt('p', 'albempty', 'No era info yet.')); return; }
  const nodes = build(albums).filter((n) => artistFilter === 'all' || n.artist === artistFilter);
  const ul = el('ul', 'etl-list');
  let last = '';
  nodes.forEach((n, i) => {
    if (last && n.artist !== last) {
      const li = el('li', 'etl-turn');
      li.appendChild(txt('span', null, n.artist === 'chandol' ? 'BoyWithUke → chandol' : 'chandol'));
      li.appendChild(txt('p', null, n.artist === 'chandol' ? 'Charley Yang drops the mask and starts over under his own name.' : ''));
      ul.appendChild(li);
    }
    last = n.artist;
    ul.appendChild(node(n, i, playList));
  });
  wrap.appendChild(ul);
}
