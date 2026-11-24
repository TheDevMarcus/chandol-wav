const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
let bad = 0;
function patch(file, pairs) {
  const f = path.join(DIR, file);
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b, all] of pairs) {
    if (!s.includes(a)) { console.log('MISSING in ' + file + ': ' + a.slice(0, 90)); bad++; continue; }
    s = all ? s.split(a).join(b) : s.replace(a, b);
  }
  fs.writeFileSync(f, s);
}
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/></svg>';

patch('js/state.js', [
  ["  queue: null,       // when set (e.g. playing an album), next/prev follow this list instead of the view\n",
   "  queue: null,       // when set (e.g. playing an album), next/prev follow this list instead of the view\n  queueName: '',     // what the queue is (album / playlist name) for \"Next from ...\"\n  upNext: [],        // songs added with Play next / Add to queue; these play first\n  lastCtx: null,     // last song played from the album/playlist/page, so queued songs don't lose our place\n"],
]);

patch('js/player.js', [
  ["export function step(dir, auto) {\n  const view = state.queue || state.view;\n  if (!view.length) return;",
   "export function step(dir, auto) {\n  const view = state.queue || state.view;\n  if (dir > 0 && state.upNext.length && !(auto && state.repeatMode === 'one')) {\n    const q = state.upNext.shift();\n    emit('queuechange', 'shift');\n    play(state.tracks.indexOf(q));\n    return;\n  }\n  if (!view.length) return;"],
  ["  const pos = view.indexOf(state.tracks[state.cur]);\n  let nextPos;",
   "  let pos = view.indexOf(state.tracks[state.cur]);\n  if (pos < 0 && state.lastCtx) pos = view.indexOf(state.lastCtx);\n  let nextPos;"],
]);

patch('js/albums.js', [
  ["import { openInfo } from './info.js';", "import { openInfo } from './info.js';\nimport { openMenu } from './menu.js';"],
  ["export function playList(list, start, shuffle) {", "export function playList(list, start, shuffle, name) {"],
  ["  state.queue = q; // the player follows this list until something else is played from the Tracks page\n",
   "  state.queue = q; // the player follows this list until something else is played from the Tracks page\n  state.queueName = name || '';\n  state.lastCtx = null;\n"],
  ["playList(a.tracks, t)", "playList(a.tracks, t, false, a.name)", true],
  ["playList(a.tracks, null, true)", "playList(a.tracks, null, true, a.name)", true],
  ["playList(a.tracks)", "playList(a.tracks, null, false, a.name)", true],
  ["const INFO_SVG = ", "const MORE_SVG = '<svg viewBox=\"0 0 24 24\"><circle cx=\"5\" cy=\"12\" r=\"1.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\"/><circle cx=\"19\" cy=\"12\" r=\"1.6\"/></svg>';\nconst INFO_SVG = "],
  ["  const ib = el('span', 'ibtn', INFO_SVG);\n  ib.setAttribute('role', 'button');\n  ib.setAttribute('aria-label', 'Song info');\n  ib.title = 'Song info';\n  ib.onclick = (e) => { e.stopPropagation(); openInfo(t); };",
   "  const ib = el('span', 'ibtn', MORE_SVG);\n  ib.setAttribute('role', 'button');\n  ib.setAttribute('aria-label', 'More options for ' + t.name);\n  ib.title = 'More';\n  const menuOpts = { onPlay: () => playList(a.tracks, t, false, a.name), hideAlbum: true };\n  ib.onclick = (e) => { e.stopPropagation(); openMenu(t, ib, menuOpts); };"],
  ["  b.oncontextmenu = (e) => { e.preventDefault(); openInfo(t); };", "  b.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }, menuOpts); };"],
]);

patch('js/info.js', [
  ["import { openLyricsPop } from './lyricpop.js';",
   "import { openLyricsPop } from './lyricpop.js';\nimport { isLiked, toggleLike } from './library.js';\nimport { addToQueue } from './queue.js';\nimport { openMenu, toast } from './menu.js';\nconst HEART_SVG = '<svg viewBox=\"0 0 24 24\"><path d=\"M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z\"/></svg>';\nconst QADD_SVG = '<svg viewBox=\"0 0 24 24\"><path d=\"M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6\"/></svg>';\nconst PL_SVG = '<svg viewBox=\"0 0 24 24\"><path d=\"M4 6h11M4 11h11M4 16h7M18 13v8M14 17h8\"/></svg>';"],
  ["playList(a.tracks, t)", "playList(a.tracks, t, false, a.name)", true],
  ["  acts.appendChild(lb);\n",
   "  acts.appendChild(lb);\n  const liked = isLiked(t);\n  const hb = el('button', 'ibtn2 icon heart' + (liked ? ' liked' : ''), HEART_SVG);\n  hb.type = 'button';\n  hb.title = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';\n  hb.setAttribute('aria-pressed', liked ? 'true' : 'false');\n  hb.onclick = () => { toast(toggleLike(t) ? 'Added to Liked Songs' : 'Removed from Liked Songs'); };\n  acts.appendChild(hb);\n  const qb = el('button', 'ibtn2 icon', QADD_SVG);\n  qb.type = 'button'; qb.title = 'Add to queue'; qb.setAttribute('aria-label', 'Add to queue');\n  qb.onclick = () => { addToQueue(t); toast('Added to queue'); };\n  acts.appendChild(qb);\n  const pb2 = el('button', 'ibtn2 icon', PL_SVG);\n  pb2.type = 'button'; pb2.title = 'Add to playlist'; pb2.setAttribute('aria-label', 'Add to playlist');\n  pb2.onclick = () => openMenu(t, pb2, { page: 'playlists' });\n  acts.appendChild(pb2);\n"],
  ["    if (e.key === 'Escape' && !sheet.hidden) { e.stopPropagation(); closeInfo(); return; }",
   "    if (e.key === 'Escape' && !sheet.hidden) { if (document.querySelector('.cmenu')) return; e.stopPropagation(); closeInfo(); return; }"],
  ["  on('trackchange', () => { if (shown && !sheet.hidden && shown.vgroup) render(shown); });",
   "  on('trackchange', () => { if (shown && !sheet.hidden && shown.vgroup) render(shown); });\n  on('library', () => { if (shown && !sheet.hidden) render(shown); });"],
]);

patch('js/tracks.js', [
  ["import { openInfo } from './info.js';", "import { openInfo } from './info.js';\nimport { openMenu } from './menu.js';"],
  ["const INFO_SVG = ", "const MORE_SVG = '<svg viewBox=\"0 0 24 24\"><circle cx=\"5\" cy=\"12\" r=\"1.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\"/><circle cx=\"19\" cy=\"12\" r=\"1.6\"/></svg>';\nconst INFO_SVG = "],
  ["    ib.innerHTML = INFO_SVG;\n    ib.setAttribute('role', 'button');\n    ib.setAttribute('aria-label', 'Song info');\n    ib.title = 'Song info';\n    ib.onclick = (e) => { e.stopPropagation(); openInfo(t); };",
   "    ib.innerHTML = MORE_SVG;\n    ib.setAttribute('role', 'button');\n    ib.setAttribute('aria-label', 'More options for ' + t.name);\n    ib.title = 'More';\n    ib.onclick = (e) => { e.stopPropagation(); openMenu(t, ib); };"],
  ["    card.oncontextmenu = (e) => { e.preventDefault(); openInfo(t); };", "    card.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }); };"],
  ["    if (e.target.closest('.card') && !e.target.closest('.ibtn')) state.queue = null;",
   "    if (e.target.closest('.card') && !e.target.closest('.ibtn') && !e.target.closest('.vbadge')) { state.queue = null; state.queueName = ''; state.lastCtx = null; }"],
]);

patch('js/overlay.js', [
  ["import { openInfo } from './info.js';", "import { openInfo } from './info.js';\nimport { renderQueueInto } from './queue.js';"],
]);
{
  const f = path.join(DIR, 'js/overlay.js');
  let s = fs.readFileSync(f, 'utf8');
  const a = s.indexOf('function renderQueue(animate) {');
  const b = a < 0 ? -1 : s.indexOf('\n}\n', a);
  if (a < 0 || b < 0) { console.log('MISSING in js/overlay.js: renderQueue body'); bad++; }
  else {
    s = s.slice(0, a) + "function renderQueue(animate) {\n  // now playing, your queue, then what's next from the album / playlist / page\n  renderQueueInto($('ovQueueList'), animate);" + s.slice(b);
    fs.writeFileSync(f, s);
  }
}

patch('js/search.js', [
  ["import { subline, explicitBadge } from './data.js';", "import { subline, explicitBadge } from './data.js';\nimport { openMenu } from './menu.js';"],
  ["  state.queue = null;\n  play(i);", "  state.queue = null;\n  state.queueName = '';\n  state.lastCtx = null;\n  play(i);"],
  ["  b.onclick = () => pick(t);\n  b.dataset.id = String(idx(t));\n  li.appendChild(b);",
   "  b.onclick = () => pick(t);\n  b.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }); };\n  b.dataset.id = String(idx(t));\n  li.appendChild(b);"],
  ["    if (isOpen && !dock.contains(e.target) && !e.target.closest('.dock')) close(false);",
   "    if (isOpen && !dock.contains(e.target) && !e.target.closest('.dock') && !e.target.closest('.cmenu')) close(false);"],
]);

patch('index.html', [
  ["<link rel=\"stylesheet\" href=\"css/eq.css\">", "<link rel=\"stylesheet\" href=\"css/eq.css\">\n<link rel=\"stylesheet\" href=\"css/library.css\">"],
  ["      <button class=\"pill\" id=\"navMissing\" type=\"button\">",
   "      <button class=\"pill\" id=\"navLibrary\" type=\"button\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M4 4v16M9 4v16M14 4l6 16\"/></svg>\n        Library\n      </button>\n      <button class=\"pill\" id=\"navMissing\" type=\"button\">"],
  ["<main id=\"albumsView\" hidden></main>", "<main id=\"albumsView\" hidden></main>\n\n<main id=\"libraryView\" hidden></main>"],
  ["  <div class=\"info\" id=\"dock-info\"><b id=\"title\">Nothing playing</b><span id=\"artist\">Pick a song</span></div>",
   "  <div class=\"info\" id=\"dock-info\"><b id=\"title\">Nothing playing</b><span id=\"artist\">Pick a song</span></div>\n  <button class=\"ic likebtn\" id=\"dockLike\" type=\"button\" aria-label=\"Like\" title=\"Add to Liked Songs\" disabled>" + HEART + "</button>"],
  ["  <button class=\"ic eqbtn\" id=\"eqBtn\" type=\"button\" aria-label=\"Equalizer\" title=\"Equalizer (E)\" aria-expanded=\"false\">",
   "  <button class=\"ic queuebtn\" id=\"queueBtn\" type=\"button\" aria-label=\"Queue\" title=\"Queue (Q)\" aria-expanded=\"false\">\n    <svg viewBox=\"0 0 24 24\"><path d=\"M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6\"/></svg>\n  </button>\n  <button class=\"ic eqbtn\" id=\"eqBtn\" type=\"button\" aria-label=\"Sound: effects and equalizer\" title=\"Sound (E)\" aria-expanded=\"false\">"],
  ["    <button class=\"ovpill\" id=\"ovInfoBtn\" type=\"button\"",
   "    <button class=\"ovbtn\" id=\"ovLike\" type=\"button\" aria-label=\"Like\" title=\"Add to Liked Songs\">" + HEART + "</button>\n    <button class=\"ovpill\" id=\"ovInfoBtn\" type=\"button\""],
]);

patch('js/main.js', [
  ["import { initEq } from './eq.js';", "import { initEq } from './eq.js';\nimport { initQueue } from './queue.js';\nimport { initLibraryPage, onShowLibrary } from './librarypage.js';"],
  ["  const albums = h === '#albums' || h.indexOf('#album/') === 0;\n  const tracks = !missing && !settings && !albums;",
   "  const albums = h === '#albums' || h.indexOf('#album/') === 0;\n  const library = h === '#library' || h === '#liked' || h.indexOf('#playlist/') === 0;\n  const tracks = !missing && !settings && !albums && !library;"],
  ["  $('albumsView').hidden = !albums;", "  $('albumsView').hidden = !albums;\n  $('libraryView').hidden = !library;\n  $('navLibrary').classList.toggle('active', library);"],
  ["  if (albums) onShowAlbums(h);", "  if (albums) onShowAlbums(h);\n  if (library) onShowLibrary(h);"],
  ["initEq();\n", "initEq();\ninitQueue();\ninitLibraryPage();\n"],
  ["$('navAlbums').onclick = () => { location.hash = 'albums'; };", "$('navAlbums').onclick = () => { location.hash = 'albums'; };\n$('navLibrary').onclick = () => { location.hash = 'library'; };"],
]);

console.log(bad ? bad + ' patch(es) missing' : 'all patches applied');
process.exitCode = bad ? 1 : 0;
