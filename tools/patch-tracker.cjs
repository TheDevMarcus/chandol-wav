const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
let bad = 0;
function patch(file, pairs) {
  const f = path.join(DIR, file);
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.log('MISSING in ' + file + ': ' + a.slice(0, 100)); bad++; continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(f, s);
}

patch('js/data.js', [
  ["import { groupVersions } from './versions.js';", "import { groupVersions } from './versions.js';\nimport { loadTracker, attachTracker } from './tracker.js';"],
  ["  return Promise.all([Promise.allSettled(ARTISTS.map(fetchArtist)), fetchMeta()]).then(([results, meta]) => {",
   "  return Promise.all([Promise.allSettled(ARTISTS.map(fetchArtist)), fetchMeta(), loadTracker()]).then(([results, meta]) => {"],
  ["    tracks.forEach((t) => attachMeta(t, meta[t.artistKey + ':' + t.id]));\n    groupVersions(tracks);",
   "    tracks.forEach((t) => attachMeta(t, meta[t.artistKey + ':' + t.id]));\n    attachTracker(tracks); // tracker info + era for unreleased songs (if data/tracker-index.json exists)\n    groupVersions(tracks);"],
]);

patch('js/versions.js', [
  ["    const key = t.artistKey + '|' + baseTitle(t.name);",
   "    const key = t.artistKey + '|' + (t.tkAll && t.tkAll.length ? t.tkAll[0].key : baseTitle(t.name));"],
]);

patch('js/info.js', [
  ["import { releasedOf } from './versions.js';", "import { releasedOf } from './versions.js';\nimport { trackerSection } from './tracker.js';"],
  ["  card.appendChild(grid);\n",
   "  card.appendChild(grid);\n\n  // what the tracker knows about this song (and its other versions)\n  const tks = trackerSection(t, {\n    play: (x) => { state.queue = null; state.queueName = ''; state.lastCtx = null; play(state.tracks.indexOf(x)); },\n    info: (x) => render(x),\n  });\n  if (tks) card.appendChild(tks);\n"],
]);

patch('js/missing.js', [
  ["import { play, togglePlay } from './player.js';",
   "import { play, togglePlay } from './player.js';\nimport { loadTracker, trackerData, searchTracker, entryRow } from './tracker.js';\nimport { openInfo } from './info.js';\n\n// \"In the tracker\": what's known about songs with that name, even ones that aren't on the site\nfunction appendTracker(box, raw, anim) {\n  if (!trackerData()) {\n    loadTracker().then(() => { if (!$('missingView').hidden && trackerData()) renderMiss(); });\n    return;\n  }\n  const found = searchTracker(raw, 6);\n  if (!found.length) return;\n  const sec = document.createElement('div');\n  sec.className = 'mtk' + (anim ? ' enter' : '');\n  const h = document.createElement('h3');\n  h.textContent = 'In the tracker';\n  const p = document.createElement('p');\n  p.textContent = 'What\\u2019s known about songs with that name \\u2014 including ones that aren\\u2019t on this site.';\n  const ul = document.createElement('ul');\n  ul.className = 'tklist';\n  found.forEach((e) => ul.appendChild(entryRow(e, {\n    showEra: true,\n    play: (t) => { state.queue = null; state.queueName = ''; play(state.tracks.indexOf(t)); },\n    info: (t) => openInfo(t),\n  })));\n  sec.append(h, p, ul);\n  box.appendChild(sec);\n}"],
  ["  if (!found.length) { say(\"Nothing close to that here. It looks like it's missing.\"); return; }",
   "  if (!found.length) {\n    const inTracker = trackerData() && searchTracker(raw, 1).length;\n    say(inTracker ? \"It's not on this site \\u2014 here's what the tracker knows.\" : \"Nothing close to that here. It looks like it's missing.\");\n    appendTracker(box, raw, anim);\n    return;\n  }"],
  ["  found.forEach((x, n) => box.appendChild(miniCard(x.t, anim, n + 1)));\n  refreshMinis();\n}",
   "  found.forEach((x, n) => box.appendChild(miniCard(x.t, anim, n + 1)));\n  refreshMinis();\n  appendTracker(box, raw, anim);\n}"],
]);

patch('js/main.js', [
  ["import { initLibraryPage, onShowLibrary } from './librarypage.js';", "import { initLibraryPage, onShowLibrary } from './librarypage.js';\nimport { initTrackerPage, onShowTracker } from './trackerpage.js';"],
  ["  const tracks = !missing && !settings && !albums && !library;", "  const trackerPg = h === '#tracker';\n  const tracks = !missing && !settings && !albums && !library && !trackerPg;"],
  ["  $('libraryView').hidden = !library;", "  $('libraryView').hidden = !library;\n  $('trackerView').hidden = !trackerPg;\n  $('navTracker').classList.toggle('active', trackerPg);"],
  ["  if (library) onShowLibrary(h);", "  if (library) onShowLibrary(h);\n  if (trackerPg) onShowTracker();"],
  ["initLibraryPage();\n", "initLibraryPage();\ninitTrackerPage();\n"],
  ["$('navLibrary').onclick = () => { location.hash = 'library'; };", "$('navLibrary').onclick = () => { location.hash = 'library'; };\n$('navTracker').onclick = () => { location.hash = 'tracker'; };"],
]);

patch('index.html', [
  ["<link rel=\"stylesheet\" href=\"css/library.css\">", "<link rel=\"stylesheet\" href=\"css/library.css\">\n<link rel=\"stylesheet\" href=\"css/tracker.css\">"],
  ["      <button class=\"pill\" id=\"navMissing\" type=\"button\">",
   "      <button class=\"pill\" id=\"navTracker\" type=\"button\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M4 5h16M4 10h16M4 15h10M4 20h7\"/></svg>\n        Tracker\n      </button>\n      <button class=\"pill\" id=\"navMissing\" type=\"button\">"],
  ["        Missing Something?\n", "        Missing\n"],
  ["<main id=\"libraryView\" hidden></main>", "<main id=\"libraryView\" hidden></main>\n\n<main id=\"trackerView\" hidden></main>"],
]);

console.log(bad ? bad + ' patch(es) missing' : 'all patches applied');
process.exitCode = bad ? 1 : 0;
