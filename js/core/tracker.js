
import { state } from './state.js';
import { txt as el } from './util.js';

let data = null;
let loading = null;
const byKey = new Map();
const parent = new Map();
function find(k) {
  let r = k;
  while (parent.has(r) && parent.get(r) !== r) r = parent.get(r);
  let c = k;
  while (parent.has(c) && parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
  return r;
}
function link(a, b) {
  if (!parent.has(a)) parent.set(a, a);
  if (!parent.has(b)) parent.set(b, b);
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
}
export const songId = (name) => { const k = baseKey(name); return parent.has(k) ? find(k) : null; };

export function baseKey(s) {
  return String(s || '')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/\s+v\d+\s*$/i, ' ')
    .replace(/\*/g, '')
    .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
const verOf = (s) => ((String(s).match(/\[(V\d+)\]/i) || [])[1] || '').toUpperCase();
const eraKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const cleanTitle = (s) => String(s || '').replace(/\*/g, '').trim();

export function loadTracker() {
  if (!loading) {
    loading = fetch('data/tracker-index.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        data = d && Array.isArray(d.songs) ? d : null;
        if (data) {
          data.songs.forEach((e) => {
            [e.key].concat(e.akaKeys || []).forEach((k) => {
              if (!k) return;
              if (!byKey.has(k)) byKey.set(k, []);
              byKey.get(k).push(e);
              link(e.key, k);
            });
          });
          data.songs.forEach((e) => { e.sid = find(e.key); });
        }
        return data;
      });
  }
  return loading;
}
export const trackerData = () => data;

const TYPE_RANK = { 'OG File': 0, Demo: 1, OG: 1, Throwaway: 2 };

function bestEntry(t, list) {
  const ek = eraKey(t.era), v = verOf(t.name);
  let best = null, bestScore = -1;
  list.forEach((e) => {
    let s = 0;
    if (ek && eraKey(e.era) === ek) s += 4;
    if (v && e.ver === v) s += 3;
    if (!v && !e.ver) s += 1;
    if (e.key === baseKey(t.name)) s += 2;
    s -= (TYPE_RANK[e.type] ?? 3) * 0.1;
    if (s > bestScore) { bestScore = s; best = e; }
  });
  return best;
}

export function attachTracker(tracks) {
  if (!data) return;
  data.songs.forEach((e) => { e.onSite = null; });
  tracks.forEach((t) => {
    const list = byKey.get(baseKey(t.name));
    if (!list || !list.length) return;
    t.sid = find(baseKey(t.name));
    t.tkAll = data.songs.filter((e) => e.sid === t.sid);
    if (!t.meta) {
      const e = bestEntry(t, list);
      if (e) {
        t.tk = e;
        if (!e.onSite) e.onSite = t;
        if (!t.era && e.era) t.era = e.era;
      }
    }
  });
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[n];
}
function score(q, e) {
  let best = 0;
  [e.key].concat(e.akaKeys || []).forEach((c) => {
    if (!c) return;
    let s = 1 - lev(q, c) / Math.max(q.length, c.length);
    if (q.length >= 3 && c.indexOf(q) !== -1) s = Math.max(s, 0.6 + 0.35 * q.length / c.length);
    if (c.length >= 3 && q.indexOf(c) !== -1) s = Math.max(s, 0.6 + 0.3 * c.length / q.length);
    best = Math.max(best, s);
  });
  return best;
}
export function searchTracker(raw, limit = 8, min = 0.62) {
  if (!data) return [];
  const q = baseKey(raw);
  if (q.length < 2) return [];
  return data.songs.map((e) => ({ e, s: score(q, e) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || (TYPE_RANK[a.e.type] ?? 3) - (TYPE_RANK[b.e.type] ?? 3))
    .slice(0, limit)
    .map((x) => x.e);
}

const PORTION_CLASS = {
  Full: 'ok', 'OG File': 'ok', Tagged: 'ok', 'Stem Bounce': 'ok',
  Partial: 'mid', Snippet: 'mid', 'Beat Only': 'mid', 'Vocals Only': 'mid',
  Confirmed: 'none', Rumored: 'none', Conflicting: 'none', 'Conflicting Sources': 'none',
};
export const portionClass = (p) => PORTION_CLASS[p] || 'none';
export const portionText = (p) => ({
  Full: 'Full song', 'OG File': 'Original file', Partial: 'Partial', Snippet: 'Snippet',
  Confirmed: 'Not leaked', Rumored: 'Rumored', Conflicting: 'Disputed', 'Beat Only': 'Beat only',
  'Stem Bounce': 'Stem bounce', Tagged: 'Tagged', 'Vocals Only': 'Vocals only',
}[p] || p || 'Unknown');
export const TAG_INFO = { best: ['⭐', 'Best Of'], grail: ['🏆', 'Grail'], wanted: ['🥇', 'Wanted'], worst: ['🗑️', 'Worst Of'], ai: ['🤖', 'AI vocals'] };

export function longDate(iso) {
  if (!iso) return '';
  if (/^\d{4}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}$/.test(iso)) {
    const d = new Date(iso + '-15T12:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function trackerSection(t, opts = {}) {
  if (!data || (!t.tk && !(t.tkAll && t.tkAll.length))) return null;
  const sec = el('section', 'itk');
  const head = el('h3', 'isec');
  head.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16M4 10h16M4 15h10M4 20h7"/></svg>';
  head.appendChild(document.createTextNode('From the tracker'));
  const src = el('a', 'itk-src', 'Open tracker');
  src.href = data.source; src.target = '_blank'; src.rel = 'noopener';
  head.appendChild(src);
  sec.appendChild(head);

  const e = t.tk;
  if (e) {
    const chips = el('div', 'ichips');
    chips.appendChild(el('span', 'tkpill ' + portionClass(e.portion), portionText(e.portion)));
    if (e.type) chips.appendChild(el('span', 'ichip', e.type));
    if (e.quality && e.quality !== 'Not Available') chips.appendChild(el('span', 'ichip', e.quality));
    (e.tags || []).forEach((g) => { if (TAG_INFO[g]) chips.appendChild(el('span', 'ichip tag', TAG_INFO[g].join(' '))); });
    sec.appendChild(chips);

    const grid = el('div', 'ifacts');
    const fact = (label, value) => {
      if (!value) return;
      const row = el('div', 'ifact');
      row.append(el('span', 'ifl', label), el('span', 'ifv', value));
      grid.appendChild(row);
    };
    fact('Tracker name', cleanTitle(e.title));
    fact('Era', e.era);
    fact('Also known as', (e.aka || []).join(', '));
    fact('Produced by', ((e.credits || {}).prod || []).join(', '));
    fact('Written by', ((e.credits || {}).writ || []).join(', '));
    fact('Featuring', ((e.credits || {}).feat || []).join(', '));
    fact('File date', longDate(e.fileDate));
    fact('Leaked', longDate(e.leakDate));
    fact('Length', e.length);
    sec.appendChild(grid);

    const notes = [e.notes, ...(e.extra || [])].filter(Boolean).join('\n');
    if (notes) {
      const p = el('p', 'itk-notes', notes);
      sec.appendChild(p);
      if (notes.length > 260) {
        p.classList.add('clamp');
        const more = el('button', 'itk-more', 'Show more');
        more.type = 'button';
        more.onclick = () => { const c = p.classList.toggle('clamp'); more.textContent = c ? 'Show more' : 'Show less'; };
        sec.appendChild(more);
      }
    }
    if (e.comment) sec.appendChild(el('p', 'itk-comment', e.comment));
  }

  const all = (t.tkAll || []).filter((x) => x !== e);
  if (all.length) {
    sec.appendChild(el('span', 'ivsub', (e ? 'Other entries for this song' : 'Unreleased versions in the tracker') + ' (' + all.length + ')'));
    const ul = el('ul', 'tklist');
    all.slice(0, 30).forEach((x) => ul.appendChild(entryRow(x, opts)));
    sec.appendChild(ul);
  }
  return sec;
}

export function entryRow(x, opts = {}) {
  const li = el('li', 'tkrow' + (x.onSite ? ' onsite' : ''));
  const main = el('div', 'tkmain');
  const name = el('b', null, cleanTitle(x.title));
  (x.tags || []).forEach((g) => { if (TAG_INFO[g]) name.appendChild(el('span', 'tktag', ' ' + TAG_INFO[g][0])); });
  main.appendChild(name);
  const bits = [opts.showEra ? x.era : '', x.type, x.quality !== 'Not Available' ? x.quality : '', x.length].filter(Boolean);
  main.appendChild(el('span', 'tksub', bits.join(' · ')));
  li.appendChild(main);
  const right = el('div', 'tkright');
  right.appendChild(el('span', 'tkpill ' + portionClass(x.portion), portionText(x.portion)));
  if (x.leakDate) right.appendChild(el('span', 'tkdate', 'leaked ' + longDate(x.leakDate)));
  li.appendChild(right);
  if (x.onSite && opts.play) {
    const b = el('button', 'tkplay');
    b.type = 'button';
    b.title = 'Play ' + cleanTitle(x.title);
    b.setAttribute('aria-label', 'Play ' + cleanTitle(x.title));
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    b.onclick = (ev) => { ev.stopPropagation(); opts.play(x.onSite); };
    li.prepend(b);
  } else {
    li.prepend(el('span', 'tkdot', ''));
  }
  if (x.onSite && opts.info) { li.classList.add('clickable'); li.onclick = () => opts.info(x.onSite); }
  return li;
}

export const onSiteCount = () => (data ? data.songs.filter((e) => e.onSite).length : 0);
export const isTrackerReady = () => !!data;
export function playTrack(t) { return state.tracks.indexOf(t); }
