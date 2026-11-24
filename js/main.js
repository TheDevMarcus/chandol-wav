
import { $, showAnimated, hideAnimated } from './core/util.js';
import { state, on } from './core/state.js';
import { playList } from './pages/albums.js';
import { play } from './player/player.js';
import { initStars } from './ui/stars.js';
import { initPlayer } from './player/player.js';
import { initEdgeGlow } from './player/edgeglow.js';
import { initTracks, loadTracks } from './pages/tracks.js';
import { initMissing, onShowMissing } from './pages/missing.js';
import { initOverlay } from './player/overlay.js';
import { initSettings } from './pages/settings.js';
import { onShowTracks } from './pages/tracks.js';
import { initSearch } from './ui/search.js';
import { initLogoMenu } from './ui/logomenu.js';
import { initLyricsPop } from './lyrics/lyricpop.js';
import { initAlbums, onShowAlbums } from './pages/albums.js';
import { initInfo } from './ui/info.js';
import { initEq } from './player/eq.js';
import { initQueue } from './player/queue.js';
import { initLibraryPage, onShowLibrary } from './pages/librarypage.js';
import { initTrackerPage, onShowTracker } from './pages/trackerpage.js';
import { initCoverTheme } from './ui/theme.js';
import { initShare, songFromUrl } from './ui/share.js';
import { initAccount } from './ui/account.js';
import { initAdmin, onShowAdmin } from './pages/admin.js';
import { onShowAbout } from './pages/about.js';
import { bootJuice } from './core/juice.js';
import { path, go, onRoute, initRouter, migrateHash } from './core/router.js';

{
  const nav = navigator, conn = nav.connection || {};
  if ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || (nav.deviceMemory && nav.deviceMemory <= 2) || conn.saveData) {
    document.documentElement.classList.add('lite');
    document.documentElement.dataset.liteDevice = '1';
  }
}

const glider = document.createElement('span');
glider.className = 'glider';
glider.setAttribute('aria-hidden', 'true');
document.querySelector('.pillbar').prepend(glider);

function placeGlider(instant) {
  const a = document.querySelector('.pill.active');
  if (!a || !a.offsetWidth) return;
  if (instant) glider.style.transition = 'none';
  glider.style.width = a.offsetWidth + 'px';
  glider.style.height = a.offsetHeight + 'px';
  glider.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
  if (instant) { void glider.offsetWidth; glider.style.transition = ''; }
  glider.classList.add('ready');
}

const mobileNav = () => window.matchMedia('(max-width: 700px)').matches;

function route(first) {
  const h = path();
  const missing = h === '/missing';
  const settings = h === '/settings';
  const albums = h === '/albums' || h.indexOf('/album/') === 0;
  const library = h === '/library' || h === '/liked' || h.indexOf('/playlist/') === 0;
  const trackerPg = h === '/tracker';
  const adminPg = h === '/admin';
  const about = h === '/about';
  const tracks = !missing && !settings && !albums && !library && !trackerPg && !adminPg && !about;
  $('adminView').hidden = !adminPg;
  $('aboutView').hidden = !about;
  $('navAbout').classList.toggle('active', about);
  $('navMore').classList.toggle('active', (trackerPg && !mobileNav()) || missing || settings || about);
  $('tracksView').hidden = !tracks;
  $('missingView').hidden = !missing;
  $('settingsView').hidden = !settings;
  $('albumsView').hidden = !albums;
  $('libraryView').hidden = !library;
  $('trackerView').hidden = !trackerPg;
  $('navTracker').classList.toggle('active', trackerPg);
  $('navTrackerM').classList.toggle('active', trackerPg);
  $('navLibrary').classList.toggle('active', library);
  $('navAlbums').classList.toggle('active', albums);
  $('navTracks').classList.toggle('active', tracks);
  $('navMissing').classList.toggle('active', missing);
  $('navSettings').classList.toggle('active', settings);
  window.scrollTo(0, 0);
  placeGlider(first === true);
  if (missing) onShowMissing();
  if (albums) onShowAlbums(h);
  if (library) onShowLibrary(h);
  if (trackerPg) onShowTracker();
  if (about) onShowAbout();
  if (adminPg) onShowAdmin();
  if (tracks && first !== true) onShowTracks();
  songFromUrl();
}

initStars($('stars'));
initPlayer();
initEdgeGlow();
initTracks();
initMissing();
initOverlay();
initSettings();
initSearch();
initLogoMenu();
initLyricsPop();
initAlbums();
initInfo();
initEq();
initQueue();
initLibraryPage();
initTrackerPage();
initCoverTheme();
initShare();
initAccount();
initAdmin();

{
  const dock = document.querySelector('.dock');
  const cv = $('dock-cv');
  const sub = $('artist');
  const shuf = $('dockShuffle');
  const layers = [0, 1].map(() => {
    const img = document.createElement('img');
    img.className = 'idlecv';
    img.alt = '';
    cv.appendChild(img);
    return img;
  });
  let front = 0, shown = null, recent = [], timer = 0;

  function pickNext() {
    const pool = state.tracks.filter((t) => t.cover);
    if (!pool.length) return null;
    const covers = [...new Set(pool.map((t) => t.cover))];
    const avoid = new Set(recent.slice(-Math.min(6, covers.length - 1)));
    const fresh = pool.filter((t) => !avoid.has(t.cover));
    const from = fresh.length ? fresh : pool.filter((t) => !shown || t.cover !== shown.cover);
    return (from.length ? from : pool)[Math.floor(Math.random() * (from.length || pool.length))];
  }

  function showNext() {
    if (!dock.classList.contains('idle') || document.hidden) return;
    const t = pickNext();
    if (!t) return;
    const img = new Image();
    img.onload = () => {
      if (!dock.classList.contains('idle')) return;
      const back = layers[1 - front];
      back.src = t.cover;
      back.classList.add('show');
      layers[front].classList.remove('show');
      front = 1 - front;
      shown = t;
      recent.push(t.cover);
      if (recent.length > 12) recent.shift();
    };
    img.onerror = () => { recent.push(t.cover); };
    img.src = t.cover;
  }

  function showFirst() {
    const imgs = [...document.querySelectorAll('#list .card .art img')];
    const ready = imgs.find((i) => i.complete && i.naturalWidth);
    const put = (src) => {
      if (!dock.classList.contains('idle') || shown) return;
      const t = state.tracks.find((x) => x.cover === src) || { cover: src };
      layers[front].src = src;
      layers[front].classList.add('show');
      shown = t;
      recent.push(src);
    };
    if (ready) { put(ready.src); return; }
    const first = imgs[0];
    if (first) first.addEventListener('load', () => put(first.src), { once: true });
    showNext();
  }

  function start() {
    clearInterval(timer);
    if (!dock.classList.contains('idle') || !state.tracks.length) return;
    showFirst();
    timer = setInterval(showNext, 5000);
  }

  let wasIdle = true;
  function setIdle() {
    const idle = state.cur < 0;
    dock.classList.toggle('idle', idle);
    if (wasIdle && !idle) {
      clearInterval(timer);
      sub.classList.remove('idlefade');
      dock.classList.add('waking');
      setTimeout(() => dock.classList.remove('waking'), 1100);
    }
    wasIdle = idle;
  }

  dock.addEventListener('click', (e) => {
    if (!dock.classList.contains('idle') || !e.target.closest('#dock-cv, #dock-info')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  on('trackchange', setIdle);
  on('rendered', () => {
    shuf.disabled = !state.tracks.length;
    shuf.title = 'Shuffle all ' + state.tracks.length + ' songs';
    if (!timer) start();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && dock.classList.contains('idle')) showNext(); });
  shuf.onclick = () => { if (state.tracks.length) playList(state.tracks, null, true, 'all songs'); };
  setIdle();
}

$('navTracks').onclick = () => { go('/tracks'); };
$('navAlbums').onclick = () => { go('/albums'); };
$('navAbout').onclick = () => { go('/about'); };

{
  const btn = $('navMore');
  const menu = $('navMoreMenu');
  let closeTimer = 0;
  const close = () => {
    if (menu.hidden || menu.classList.contains('closing')) return;
    btn.setAttribute('aria-expanded', 'false');
    if (document.documentElement.classList.contains('no-anim')) { menu.hidden = true; return; }
    menu.classList.add('closing');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { menu.hidden = true; menu.classList.remove('closing'); }, 210);
  };
  btn.onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden || menu.classList.contains('closing')) {
      clearTimeout(closeTimer);
      menu.classList.remove('closing');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      close();
    }
  };
  menu.addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  onRoute(close);
}
$('navLibrary').onclick = () => { go('/library'); };
$('navTracker').onclick = () => { go('/tracker'); };
$('navTrackerM').onclick = () => { go('/tracker'); };
$('navMissing').onclick = () => { go('/missing'); };
$('navSettings').onclick = () => { go('/settings'); };
onRoute(() => route());
window.addEventListener('resize', () => placeGlider(true));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeGlider(true));

migrateHash();
initRouter();
bootJuice();
route(true);
loadTracks();


