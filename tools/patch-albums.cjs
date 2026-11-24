const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
let bad = 0;
function patch(file, pairs) {
  const f = path.join(DIR, file);
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISSING in ' + file + ': ' + a.slice(0, 80)); bad++; continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(f, s);
}
const D = '\u00b7';

patch('state.js', [
  ["  view: [],          // tracks currently shown (after search filtering)\n",
   "  view: [],          // tracks currently shown (after search filtering)\n  queue: null,       // when set (e.g. playing an album), next/prev follow this list instead of the view\n"],
]);

patch('player.js', [
  ["  const view = state.view;\n  if (!view.length) return;", "  const view = state.queue || state.view;\n  if (!view.length) return;"],
  ["  if (state.cur < 0) { if (state.view.length) step(1, false); return; }", "  if (state.cur < 0) { if ((state.queue || state.view).length) step(1, false); return; }"],
]);

patch('data.js', [
  ["    status: typeof s.status === 'string' ? s.status.trim() : '',\n",
   "    status: typeof s.status === 'string' ? s.status.trim() : '',\n    era: typeof s.era === 'string' ? s.era.trim() : '',\n"],
  ["    trackCount: m.trackCount || null,\n    genre: m.genre || '',\n    link: m.link || '',\n  };",
   "    trackCount: m.trackCount || null,\n    discNumber: m.discNumber || null,\n    genre: m.genre || '',\n    link: m.link || '',\n    artwork: m.artwork || '',\n    appearsOn: Array.isArray(m.appearsOn) ? m.appearsOn : [],\n  };"],
]);

patch('overlay.js', [
  ["import { subline, explicitBadge } from './data.js';", "import { subline, explicitBadge } from './data.js';\nimport { openInfo } from './info.js';"],
  ["  (state.view.length ? state.view : state.tracks).forEach((t, n) => {", "  (state.queue || (state.view.length ? state.view : state.tracks)).forEach((t, n) => {"],
  ["  $('ovQueueBtn').onclick = function () {", "  $('ovInfoBtn').onclick = () => openInfo(state.tracks[state.cur]);\n  $('ovQueueBtn').onclick = function () {"],
]);

patch('search.js', [
  ["  if (i == null) return;\n  play(i);", "  if (i == null) return;\n  state.queue = null;\n  play(i);"],
]);

patch('tracks.js', [
  ["import { getOverlayTrigger } from './settings.js';", "import { getOverlayTrigger } from './settings.js';\nimport { openInfo } from './info.js';"],
  ["let pageQuery = '';", "let pageQuery = '';\nlet sortMode = 'default';\ntry { sortMode = localStorage.getItem('chandol-sort') || 'default'; } catch (e) {}\n\nconst INFO_SVG = '<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8h.01\"/></svg>';\nconst dateOf = (t) => (t.meta && (t.meta.releaseDate || t.meta.albumReleaseDate)) || '';\nconst albumKey = (t) => ((t.meta && t.meta.album) || t.era || '\\uffff').toLowerCase();\n// sort a copy of the list; songs without the needed info keep their order at the end\nfunction sortList(list) {\n  if (sortMode === 'default') return list;\n  const pos = new Map(list.map((t, i) => [t, i]));\n  const by = {\n    new: (a, b) => (!dateOf(a) - !dateOf(b)) || dateOf(b).localeCompare(dateOf(a)),\n    old: (a, b) => (!dateOf(a) - !dateOf(b)) || dateOf(a).localeCompare(dateOf(b)),\n    az: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),\n    album: (a, b) => albumKey(a).localeCompare(albumKey(b)) || ((a.meta && a.meta.trackNumber) || 999) - ((b.meta && b.meta.trackNumber) || 999) || a.name.localeCompare(b.name),\n    long: (a, b) => (b.dur || 0) - (a.dur || 0),\n    short: (a, b) => (!a.dur - !b.dur) || (a.dur || 0) - (b.dur || 0),\n  }[sortMode];\n  return by ? list.slice().sort((a, b) => by(a, b) || pos.get(a) - pos.get(b)) : list;\n}"],
  ["  state.view = state.tracks.filter((t) => {", "  state.view = sortList(state.tracks.filter((t) => {"],
  ["    return !q || (t.name + ' ' + t.artist + ' ' + (t.meta ? t.meta.album : '')).toLowerCase().indexOf(q) !== -1;\n  });",
   "    return !q || (t.name + ' ' + t.artist + ' ' + (t.meta ? t.meta.album : '') + ' ' + (t.era || '')).toLowerCase().indexOf(q) !== -1;\n  }));"],
  ["    li.appendChild(card);\n    frag.appendChild(li);",
   "    const ib = document.createElement('span');\n    ib.className = 'ibtn cardi';\n    ib.innerHTML = INFO_SVG;\n    ib.setAttribute('role', 'button');\n    ib.setAttribute('aria-label', 'Song info');\n    ib.title = 'Song info';\n    ib.onclick = (e) => { e.stopPropagation(); openInfo(t); };\n    card.appendChild(ib);\n    card.oncontextmenu = (e) => { e.preventDefault(); openInfo(t); };\n    li.appendChild(card);\n    frag.appendChild(li);"],
  ["  $('clearQuery').onclick = () => setPageQuery('');",
   "  $('clearQuery').onclick = () => setPageQuery('');\n  const sortSel = $('sortSel');\n  sortSel.value = sortMode;\n  sortSel.onchange = () => {\n    sortMode = sortSel.value;\n    try { localStorage.setItem('chandol-sort', sortMode); } catch (e) {}\n    if (state.tracks.length) render(true);\n  };\n  // playing from the Tracks page goes back to following this page's order\n  $('list').addEventListener('click', (e) => {\n    if (e.target.closest('.card') && !e.target.closest('.ibtn')) state.queue = null;\n  }, true);"],
]);

patch('main.js', [
  ["import { initLyricsPop } from './lyricpop.js';", "import { initLyricsPop } from './lyricpop.js';\nimport { initAlbums, onShowAlbums } from './albums.js';\nimport { initInfo } from './info.js';"],
  ["  const settings = h === '#settings';\n  const tracks = !missing && !settings;", "  const settings = h === '#settings';\n  const albums = h === '#albums' || h.indexOf('#album/') === 0;\n  const tracks = !missing && !settings && !albums;"],
  ["  $('settingsView').hidden = !settings;", "  $('settingsView').hidden = !settings;\n  $('albumsView').hidden = !albums;\n  $('navAlbums').classList.toggle('active', albums);"],
  ["  if (missing) onShowMissing();", "  if (missing) onShowMissing();\n  if (albums) onShowAlbums(h);"],
  ["initLyricsPop();\n", "initLyricsPop();\ninitAlbums();\ninitInfo();\n"],
  ["$('navMissing').onclick = () => { location.hash = 'missing'; };", "$('navAlbums').onclick = () => { location.hash = 'albums'; };\n$('navMissing').onclick = () => { location.hash = 'missing'; };"],
]);

console.log(bad ? bad + ' patch(es) missing' : 'all patches applied');
process.exitCode = bad ? 1 : 0;
