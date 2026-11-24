const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
let bad = 0;
function patch(file, pairs) {
  const f = path.join(DIR, file);
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISSING in ' + file + ': ' + a.slice(0, 90)); bad++; continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(f, s);
}

patch('js/data.js', [
  ["// Song list: where it comes from and how entries become tracks.\n",
   "// Song list: where it comes from and how entries become tracks.\n\nimport { groupVersions } from './versions.js';\n"],
  ["    tracks.forEach((t) => attachMeta(t, meta[t.artistKey + ':' + t.id]));\n    return tracks;",
   "    tracks.forEach((t) => attachMeta(t, meta[t.artistKey + ':' + t.id]));\n    groupVersions(tracks);\n    return tracks;"],
]);

patch('js/settings.js', [
  ["export const getAllowMild = () => getFlag('chandol-censor-mild-ok', false);",
   "export const getAllowMild = () => getFlag('chandol-censor-mild-ok', false);\n// Show each song once on the Tracks page, with its other versions tucked inside (on by default)\nexport const getGroupVersions = () => getFlag('chandol-group-versions', true);"],
  ["  // lyrics censoring\n",
   "  // grouping versions\n  const groupBox = document.getElementById('setGroup');\n  groupBox.checked = getGroupVersions();\n  groupBox.addEventListener('change', () => {\n    setFlag('chandol-group-versions', groupBox.checked);\n    emit('librarysettings');\n  });\n\n  // lyrics censoring\n"],
]);

patch('js/tracks.js', [
  ["import { getOverlayTrigger } from './settings.js';",
   "import { getOverlayTrigger, getGroupVersions } from './settings.js';\nimport { collapseVersions } from './versions.js';"],
  ["import { state, on, emit } from './state.js';", "import { state, on, emit } from './state.js';"],
  ["  state.view = sortList(state.tracks.filter((t) => {",
   "  const filtered = sortList(state.tracks.filter((t) => {"],
  ["    return !q || (t.name + ' ' + t.artist + ' ' + (t.meta ? t.meta.album : '') + ' ' + (t.era || '')).toLowerCase().indexOf(q) !== -1;\n  }));",
   "    return !q || (t.name + ' ' + t.artist + ' ' + (t.meta ? t.meta.album : '') + ' ' + (t.era || '')).toLowerCase().indexOf(q) !== -1;\n  }));\n  state.view = getGroupVersions() ? collapseVersions(filtered) : filtered;"],
  ["    card.appendChild(ib);\n",
   "    card.appendChild(ib);\n    if (t.vgroup && getGroupVersions()) {\n      const n = t.vgroup.length;\n      const vb = document.createElement('span');\n      vb.className = 'vbadge';\n      vb.innerHTML = VERS_SVG + '<span>' + n + ' versions</span>';\n      vb.setAttribute('role', 'button');\n      vb.title = 'See all ' + n + ' versions';\n      vb.onclick = (e) => { e.stopPropagation(); openInfo(t, 'versions'); };\n      if (list.classList.contains('list')) mid.appendChild(vb);\n      else art.appendChild(vb);\n    }\n"],
  ["const INFO_SVG = ",
   "const VERS_SVG = '<svg viewBox=\"0 0 24 24\"><path d=\"M4 8l8-4 8 4-8 4z\"/><path d=\"M4 12l8 4 8-4M4 16l8 4 8-4\"/></svg>';\nconst INFO_SVG = "],
  ["  // playing from the Tracks page goes back to following this page's order\n",
   "  on('librarysettings', () => { if (state.tracks.length) render(true); });\n  // playing from the Tracks page goes back to following this page's order\n"],
]);

patch('js/albums.js', [
  ["  b.appendChild(txt('span', 'atrdur', t.dur ? fmt(t.dur) : ''));",
   "  if (t.vgroup) {\n    const vc = txt('span', 'vchip', t.vgroup.length + ' versions');\n    vc.setAttribute('role', 'button');\n    vc.title = 'See all versions';\n    vc.onclick = (e) => { e.stopPropagation(); openInfo(t, 'versions'); };\n    sub.appendChild(vc);\n  }\n  b.appendChild(txt('span', 'atrdur', t.dur ? fmt(t.dur) : ''));"],
]);

patch('js/info.js', [
  ["import { state, audio } from './state.js';", "import { state, audio, on } from './state.js';\nimport { releasedOf } from './versions.js';"],
  ["function goAlbum(a) {",
`const VERS_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>';

// one version in the Versions list (featured = the big card at the top)
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
  tx.appendChild(txt('span', 'ivsubt', subBits.filter(Boolean).join(' \\u00b7 ')));
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

function goAlbum(a) {`],
  ["function render(t) {\n", "function render(t, focus) {\n"],
  ["  if (m.genre) chips.appendChild(txt('span', 'ichip', m.genre));",
   "  if (m.genre) chips.appendChild(txt('span', 'ichip', m.genre));\n  if (t.vgroup) {\n    const vc = el('button', 'ichip vers', VERS_SVG + t.vgroup.length + ' versions');\n    vc.type = 'button';\n    vc.onclick = () => { const s = $('iVersions'); if (s) card.scrollTo({ top: s.offsetTop - 16, behavior: 'smooth' }); };\n    chips.appendChild(vc);\n  }"],
  ["  card.appendChild(acts);\n",
   `  card.appendChild(acts);

  // all versions of this song: the released one on top, the rest underneath
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
`],
  ["  card.scrollTop = keep;\n  shown = t;",
   "  const vs = focus === 'versions' && $('iVersions');\n  card.scrollTop = vs ? Math.max(0, vs.offsetTop - 16) : keep;\n  shown = t;"],
  ["export function openInfo(t) {\n  if (!t) return;\n  render(t);",
   "export function openInfo(t, focus) {\n  if (!t) return;\n  render(t, focus);"],
  ["  // keep the play/pause button honest\n  audio.addEventListener('play', () => { if (shown && state.tracks[state.cur] === shown) render(shown); });\n  audio.addEventListener('pause', () => { if (shown && state.tracks[state.cur] === shown) render(shown); });",
   "  // keep the play/pause buttons honest (for this song and its other versions)\n  const refresh = () => {\n    const c = state.tracks[state.cur];\n    if (shown && !sheet.hidden && (c === shown || (shown.vgroup && shown.vgroup.includes(c)))) render(shown);\n  };\n  audio.addEventListener('play', refresh);\n  audio.addEventListener('pause', refresh);\n  on('trackchange', () => { if (shown && !sheet.hidden && shown.vgroup) render(shown); });"],
]);

patch('index.html', [
  ["    <div class=\"sgroup\">\n      <h3 class=\"slabel\">Lyrics</h3>",
   "    <div class=\"sgroup\">\n      <h3 class=\"slabel\">Library</h3>\n      <label class=\"srow swrow\">\n        <span class=\"stext\"><strong>Group song versions</strong><br><small>Show each song once on Tracks; its instrumentals, mixes and other takes are under “versions”</small></span>\n        <input type=\"checkbox\" class=\"sw\" id=\"setGroup\" role=\"switch\">\n      </label>\n    </div>\n    <div class=\"sgroup\">\n      <h3 class=\"slabel\">Lyrics</h3>"],
]);

console.log(bad ? bad + ' patch(es) missing' : 'all patches applied');
process.exitCode = bad ? 1 : 0;
