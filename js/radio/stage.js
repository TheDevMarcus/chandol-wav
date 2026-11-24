import { fetchLyrics, parseLrc } from '../lyrics/lyrics.js';
import { censor } from '../core/censor.js';
import { el, txt } from '../core/util.js';

let root, lyricsList, songKey = '', lines = [], synced = false, lastIdx = -2;

export function buildStage(host) {
  root = el('section', 'stg');
  root.innerHTML = `
    <div class="stg-scene">
      <div class="rnbg"></div>
      <div class="stg-veil"></div>
      <div class="stg-glow"></div>
      <div class="stg-grain"></div>
      <div class="stg-top">
        <span class="stg-air"><i></i>ON AIR</span>
        <div class="stg-eq"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <aside class="stg-lyrics">
        <div class="stg-lyhead"><svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>Lyrics</div>
        <ol class="stg-lylist"></ol>
      </aside>
      <div class="stg-screen">
        <div class="stg-disc"><div class="rart"><img alt=""></div></div>
        <div class="stg-now"><span class="rtag"></span><h3 class="rtitle"></h3><p class="rby"></p></div>
      </div>
    </div>`;
  host.appendChild(root);
  lyricsList = root.querySelector('.stg-lylist');
  root.querySelector('.rart img').onload = function () { this.classList.add('loaded'); };
  return root;
}

export function setSong(song) {
  if (!lyricsList || !song || song.key === songKey) return;
  songKey = song.key; lines = []; synced = false; lastIdx = -2;
  lyricsList.innerHTML = '<li class="ly-note">Looking for lyrics…</li>';
  const key = song.key;
  fetchLyrics({ id: 'radio:' + key, name: song.name, artist: song.artist, dur: song.dur }).then((r) => {
    if (songKey !== key) return;
    lyricsList.innerHTML = '';
    if (!r) { lyricsList.innerHTML = '<li class="ly-note">No lyrics for this one yet. Just vibe.</li>'; return; }
    if (r.synced) { lines = parseLrc(r.synced); synced = lines.length > 0; }
    if (!synced) lines = String(r.plain || '').split(/\r?\n/).filter((l) => l.trim()).map((t) => ({ t: -1, text: t }));
    lines.forEach((l) => lyricsList.appendChild(txt('li', 'ly', censor(l.text))));
    if (!synced) lyricsList.insertBefore(txt('li', 'ly-note', 'These lyrics aren’t timed, so they won’t follow along.'), lyricsList.firstChild);
  }).catch(() => { if (songKey === key) lyricsList.innerHTML = '<li class="ly-note">Couldn’t load lyrics.</li>'; });
}

export function tickLyrics(at) {
  if (!synced || !lines.length) return;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t <= at + 0.25) idx = i; else break; }
  if (idx === lastIdx) return;
  lastIdx = idx;
  const items = lyricsList.querySelectorAll('.ly');
  items.forEach((li, i) => { li.classList.toggle('on', i === idx); li.classList.toggle('past', i < idx); });
  const cur = items[idx];
  if (cur) lyricsList.scrollTo({ top: cur.offsetTop - lyricsList.clientHeight / 2 + cur.offsetHeight / 2, behavior: 'smooth' });
}
