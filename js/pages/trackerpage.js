
import { $, txt as el } from '../core/util.js';
import { state, on } from '../core/state.js';
import { play } from '../player/player.js';
import { openInfo } from '../ui/info.js';
import { loadTracker, trackerData, entryRow, searchTracker, onSiteCount, portionClass, baseKey } from '../core/tracker.js';

const FILTERS = [
  ['all', 'All'],
  ['avail', 'Full & OG files', (e) => portionClass(e.portion) === 'ok'],
  ['part', 'Snippets & partials', (e) => portionClass(e.portion) === 'mid'],
  ['none', 'Not leaked', (e) => portionClass(e.portion) === 'none'],
  ['site', 'On this site', (e) => !!e.onSite],
  ['star', '⭐ / 🏆', (e) => (e.tags || []).some((g) => g === 'best' || g === 'grail')],
];

let filter = 'all';
let query = '';
const open = new Set();
let built = false;

const rowOpts = {
  play: (t) => { state.queue = null; state.queueName = ''; state.lastCtx = null; play(state.tracks.indexOf(t)); },
  info: (t) => openInfo(t),
};

function matches(e) {
  const f = FILTERS.find((x) => x[0] === filter);
  if (f && f[2] && !f[2](e)) return false;
  return true;
}

function render() {
  const root = $('trackerView');
  root.textContent = '';
  const d = trackerData();
  if (!d) {
    root.appendChild(el('p', 'albempty', built ? 'Couldn’t load the tracker. Run tools/build-tracker.py to make data/tracker-index.json.' : 'Loading the tracker…'));
    return;
  }

  const head = el('div', 'albhead');
  head.appendChild(el('h2', null, 'Tracker'));
  const stat = el('span', 'albstat');
  stat.textContent = `${d.songs.length.toLocaleString()} songs · ${d.eras.length} eras · ${onSiteCount()} on this site · `;
  const src = el('a', null, 'source sheet');
  src.href = d.source; src.target = '_blank'; src.rel = 'noopener';
  stat.appendChild(src);
  head.appendChild(stat);
  root.appendChild(head);

  const bar = el('div', 'tkbar');
  const box = el('label', 'tksearch');
  box.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search the tracker (names and aka names)';
  input.value = query;
  input.setAttribute('aria-label', 'Search the tracker');
  let t;
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => { query = input.value.trim(); renderBody(); }, 140); };
  box.appendChild(input);
  bar.appendChild(box);
  const pills = el('div', 'af tkfilters');
  FILTERS.forEach(([k, label]) => {
    const b = el('button', 'afpill' + (filter === k ? ' active' : ''), label);
    b.type = 'button';
    b.onclick = () => { filter = k; pills.querySelectorAll('.afpill').forEach((x) => x.classList.toggle('active', x === b)); renderBody(); };
    pills.appendChild(b);
  });
  bar.appendChild(pills);
  root.appendChild(bar);

  const body = el('div', 'tkbody');
  body.id = 'tkBody';
  root.appendChild(body);
  renderBody();
}

function renderBody() {
  const body = $('tkBody');
  if (!body) return;
  body.textContent = '';
  const d = trackerData();

  if (query.length >= 2) {
    const found = searchTracker(query, 80, 0.55).filter(matches);
    body.appendChild(el('p', 'tkcount', found.length ? found.length + ' match' + (found.length === 1 ? '' : 'es') : 'Nothing in the tracker matches that.'));
    const ul = el('ul', 'tklist big');
    found.forEach((e) => ul.appendChild(withDetails(e, true)));
    body.appendChild(ul);
    return;
  }

  const eras = d.eras.slice().reverse();
  eras.forEach((era) => {
    const list = d.songs.filter((e) => e.era === era.name && matches(e));
    if (!list.length) return;
    const sec = el('section', 'tkera');
    const isOpen = open.has(era.name) || filter !== 'all';
    sec.classList.toggle('open', isOpen);
    const h = el('button', 'tkerahead');
    h.type = 'button';
    h.setAttribute('aria-expanded', String(isOpen));
    h.innerHTML = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
    h.appendChild(el('b', null, era.name));
    const onsite = list.filter((e) => e.onSite).length;
    const avail = list.filter((e) => portionClass(e.portion) === 'ok').length;
    const snip = list.filter((e) => portionClass(e.portion) === 'mid').length;
    const meta = el('span', 'tkerameta', [list.length + ' songs', avail ? avail + ' full' : '', snip ? snip + ' snippets' : '', onsite ? onsite + ' on site' : ''].filter(Boolean).join(' · '));
    h.appendChild(meta);
    sec.appendChild(h);
    const ul = el('ul', 'tklist big');
    const fill = () => { if (!ul.childElementCount) list.forEach((e) => ul.appendChild(withDetails(e, false))); };
    if (isOpen) fill();
    h.onclick = () => {
      const now = sec.classList.toggle('open');
      h.setAttribute('aria-expanded', String(now));
      if (now) { open.add(era.name); fill(); } else open.delete(era.name);
    };
    sec.appendChild(ul);
    body.appendChild(sec);
  });
}

function withDetails(e, showEra) {
  const li = entryRow(e, { ...rowOpts, showEra, info: null });
  li.classList.add('expandable');
  li.onclick = (ev) => {
    if (ev.target.closest('.tkplay, a, .tkdetail')) return;
    const ex = li.querySelector('.tkdetail');
    if (ex) { ex.remove(); li.classList.remove('expanded'); return; }
    li.classList.add('expanded');
    const det = el('div', 'tkdetail');
    const add = (label, value) => { if (!value) return; const p = el('p'); p.append(el('span', 'ifl', label + ' '), document.createTextNode(value)); det.appendChild(p); };
    add('Era', showEra ? '' : e.era);
    add('Also known as', (e.aka || []).join(', '));
    add('Produced by', ((e.credits || {}).prod || []).join(', '));
    add('Written by', ((e.credits || {}).writ || []).join(', '));
    add('File date', e.fileDate);
    add('Leaked', e.leakDate);
    const notes = [e.notes, ...(e.extra || [])].filter(Boolean).join('\n');
    if (notes) det.appendChild(el('p', 'itk-notes', notes));
    if (e.comment) det.appendChild(el('p', 'itk-comment', e.comment));
    if (e.onSite) {
      const b = el('button', 'abtn', 'Song info');
      b.type = 'button';
      b.onclick = () => openInfo(e.onSite);
      det.appendChild(b);
    }
    if (!det.childElementCount) det.appendChild(el('p', 'itk-comment', 'No extra details in the tracker.'));
    li.appendChild(det);
  };
  return li;
}

export function onShowTracker() {
  if (!trackerData()) {
    render();
    loadTracker().then(() => { built = true; if (!$('trackerView').hidden) render(); });
    return;
  }
  render();
}

export function initTrackerPage() {
  on('rendered', () => { if (!$('trackerView').hidden) render(); });
  on('trackchange', () => {
    document.querySelectorAll('#trackerView .tkrow').forEach((li) => li.classList.remove('playing'));
  });
}

export { baseKey };
