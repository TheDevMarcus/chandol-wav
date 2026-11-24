import { $, el, txt } from '../core/util.js';
import { go, path } from '../core/router.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATS = [['all', 'Everything'], ['release', 'Releases'], ['milestone', 'Milestones'], ['live', 'Live'], ['name', 'The name'], ['personal', 'Personal']];
const SEARCH_SVG = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let data = null, meta = null, built = false, loading = null;
let input = null, countEl = null, cat = 'all';
const secs = [];
const groups = [];

function pretty(d) {
  const p = String(d || '').split('-');
  if (p.length < 2) return p[0] || '';
  if (p.length < 3) return MONTHS[Number(p[1]) - 1] + ' ' + p[0];
  return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
}

function load() {
  if (data) return Promise.resolve();
  if (!loading) {
    loading = Promise.all([
      fetch('data/about.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('data/released-meta.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ]).then((res) => { data = res[0] || {}; meta = res[1] || {}; });
  }
  return loading;
}

function albumIndex() {
  const by = new Map();
  Object.keys(meta).forEach((k) => {
    const m = meta[k];
    if (!m || !m.album) return;
    const s = slug(m.album);
    if (!by.has(s)) by.set(s, { key: m.artistKey + '--' + s, art: m.artwork || '' });
    else if (!by.get(s).art && m.artwork) by.get(s).art = m.artwork;
  });
  return by;
}

function picture(src, cls) {
  const box = el('span', cls);
  if (!src) return box;
  const img = el('img');
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.onload = () => img.classList.add('loaded');
  img.onerror = () => img.remove();
  img.src = src;
  box.appendChild(img);
  return box;
}

function mark(node, extra) {
  node.classList.add('abt-i');
  node.dataset.q = ((node.textContent || '') + ' ' + (extra || '')).toLowerCase().replace(/\s+/g, ' ');
  return node;
}

function sec(id, title, sub) {
  const s = el('section', 'abt-sec');
  s.id = 'abt-' + id;
  const h = el('div', 'abt-sechead');
  h.appendChild(txt('h3', null, title));
  if (sub) h.appendChild(txt('span', null, sub));
  s.appendChild(h);
  const entry = { id, title, el: s, items: [], nav: null };
  secs.push(entry);
  return { s, entry };
}

function buildHero(root) {
  const h = el('header', 'abt-hero');
  h.appendChild(txt('div', 'abt-kicker', 'About the artist'));
  h.appendChild(txt('h1', null, data.name || 'Charley Yang'));
  if (data.aka && data.aka.length) {
    const row = el('div', 'abt-aka');
    data.aka.forEach((a) => row.appendChild(txt('span', 'abt-chip', a)));
    h.appendChild(row);
  }
  if (data.tagline) h.appendChild(txt('p', 'abt-tag', data.tagline));
  root.appendChild(h);
}

function buildSearch(root) {
  const bar = el('div', 'abt-tools');
  const box = el('div', 'abt-searchbox', SEARCH_SVG);
  input = el('input', 'abt-search');
  input.type = 'search';
  input.placeholder = 'Search his whole history…';
  input.setAttribute('aria-label', 'Search everything on this page');
  input.autocomplete = 'off';
  box.appendChild(input);
  const clear = el('button', 'abt-clear', X_SVG);
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Clear search');
  clear.onclick = () => { input.value = ''; apply(); input.focus(); };
  box.appendChild(clear);
  bar.appendChild(box);
  countEl = txt('div', 'abt-count', '');
  bar.appendChild(countEl);
  root.appendChild(bar);

  const nav = el('nav', 'abt-jump');
  root.appendChild(nav);
  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; apply(); } });
  return nav;
}

function buildJump(nav) {
  secs.forEach((s) => {
    const b = el('button', 'abt-jumpb');
    b.type = 'button';
    b.textContent = s.title;
    b.onclick = () => {
      const y = s.el.getBoundingClientRect().top + window.scrollY - 14;
      window.scrollTo({ top: y, behavior: document.documentElement.classList.contains('no-anim') ? 'auto' : 'smooth' });
    };
    s.nav = b;
    nav.appendChild(b);
  });
}

function buildFacts(root) {
  if (!data.facts || !data.facts.length) return;
  const b = sec('quick', 'Quick facts', data.facts.length + ' fields');
  const grid = el('div', 'abt-facts');
  data.facts.forEach((f) => {
    const c = el('div', 'abt-fact');
    c.appendChild(txt('span', 'abt-fk', f.k));
    c.appendChild(txt('span', 'abt-fv', f.v));
    grid.appendChild(mark(c));
    b.entry.items.push(c);
  });
  b.s.appendChild(grid);
  root.appendChild(b.s);
}

function buildStory(root) {
  if (!data.bio || !data.bio.length) return;
  const b = sec('story', 'The story');
  const wrap = el('div', 'abt-bio');
  data.bio.forEach((p) => {
    const node = txt('p', null, p);
    wrap.appendChild(mark(node));
    b.entry.items.push(node);
  });
  b.s.appendChild(wrap);
  root.appendChild(b.s);
}

function buildName(root) {
  const n = data.nameStory;
  if (!n || !n.steps) return;
  const b = sec('name', 'The name', 'Chandol → Charley → chandol');
  if (n.intro) {
    const p = txt('p', 'abt-lede', n.intro);
    b.s.appendChild(mark(p));
    b.entry.items.push(p);
  }
  const list = el('ol', 'abt-steps');
  n.steps.forEach((s) => {
    const li = el('li', 'abt-step');
    const top = el('div', 'abt-steptop');
    top.appendChild(txt('b', null, s.n));
    top.appendChild(txt('span', 'abt-years', s.y));
    li.appendChild(top);
    li.appendChild(txt('p', null, s.t));
    list.appendChild(mark(li));
    b.entry.items.push(li);
  });
  b.s.appendChild(list);
  (n.notes || []).forEach((note) => {
    const p = txt('p', 'abt-note', note);
    b.s.appendChild(mark(p));
    b.entry.items.push(p);
  });
  root.appendChild(b.s);
}

function buildTimeline(root) {
  if (!data.timeline || !data.timeline.length) return;
  const b = sec('timeline', 'Timeline', data.timeline.length + ' moments');

  const chips = el('div', 'abt-cats');
  CATS.forEach(([k, label]) => {
    const c = el('button', 'abt-catb' + (k === 'all' ? ' on' : ''));
    c.type = 'button';
    c.textContent = label;
    c.dataset.cat = k;
    c.onclick = () => {
      cat = k;
      [...chips.children].forEach((x) => x.classList.toggle('on', x.dataset.cat === k));
      apply();
    };
    chips.appendChild(c);
  });
  b.s.appendChild(chips);

  const list = el('div', 'abt-tl');
  let year = '', group = null;
  data.timeline.slice().sort((x, y) => String(x.d).localeCompare(String(y.d))).forEach((e) => {
    const y = String(e.d).slice(0, 4);
    if (y !== year) {
      year = y;
      group = el('div', 'abt-yr');
      group.appendChild(txt('div', 'abt-yrhead', y));
      list.appendChild(group);
      groups.push({ el: group, items: [] });
    }
    const row = el('div', 'abt-ev');
    row.dataset.c = e.c || '';
    row.appendChild(el('span', 'abt-dot'));
    const body = el('div', 'abt-evbody');
    const top = el('div', 'abt-evtop');
    top.appendChild(txt('h4', null, e.t));
    const when = pretty(e.d);
    if (when) top.appendChild(txt('time', null, when));
    body.appendChild(top);
    if (e.x) body.appendChild(txt('p', null, e.x));
    row.appendChild(body);
    group.appendChild(mark(row, y));
    b.entry.items.push(row);
    groups[groups.length - 1].items.push(row);
  });
  b.s.appendChild(list);
  root.appendChild(b.s);
}

function buildDisc(root) {
  if (!data.releases || !data.releases.length) return;
  const idx = albumIndex();
  const b = sec('music', 'Discography', data.releases.length + ' releases');
  const list = el('div', 'abt-rels');
  data.releases.slice().sort((x, y) => y.d.localeCompare(x.d)).forEach((r) => {
    const hit = idx.get(slug(r.n));
    const row = el(hit ? 'button' : 'div', 'abt-rel');
    if (hit) { row.type = 'button'; row.onclick = () => { go('/album/' + hit.key); }; }
    row.appendChild(picture(hit && hit.art, 'abt-relart'));
    const body = el('div', 'abt-relbody');
    const top = el('div', 'abt-reltop');
    top.appendChild(txt('b', null, r.n));
    top.appendChild(txt('span', 'abt-reltype', r.t));
    body.appendChild(top);
    body.appendChild(txt('span', 'abt-relmeta', pretty(r.d) + ' · ' + r.l));
    if (r.x) body.appendChild(txt('p', null, r.x));
    row.appendChild(body);
    list.appendChild(mark(row));
    b.entry.items.push(row);
  });
  b.s.appendChild(list);
  root.appendChild(b.s);
}

function buildPairs(root, id, title, items, keyOf, valOf) {
  if (!items || !items.length) return;
  const b = sec(id, title, items.length + '');
  const list = el('div', 'abt-pairs');
  items.forEach((it) => {
    const row = el('div', 'abt-pair');
    row.appendChild(txt('b', null, keyOf(it)));
    row.appendChild(txt('p', null, valOf(it)));
    list.appendChild(mark(row));
    b.entry.items.push(row);
  });
  b.s.appendChild(list);
  root.appendChild(b.s);
}

function buildPhotos(root) {
  const shots = (data.photos || []).filter((p) => p && p.src);
  if (!shots.length) return;
  const b = sec('photos', 'Photos', shots.length + '');
  const g = el('div', 'abt-shots');
  shots.forEach((p) => {
    const fig = el('figure', 'abt-shot');
    fig.appendChild(picture(p.src, 'abt-shotimg'));
    if (p.caption) fig.appendChild(txt('figcaption', null, p.caption));
    g.appendChild(mark(fig, p.caption));
    b.entry.items.push(fig);
  });
  b.s.appendChild(g);
  root.appendChild(b.s);
}

function buildTrivia(root) {
  if (!data.trivia || !data.trivia.length) return;
  const b = sec('trivia', 'Deep cuts', data.trivia.length + ' things');
  const list = el('ul', 'abt-trivia');
  data.trivia.forEach((t) => {
    const li = txt('li', null, t);
    list.appendChild(mark(li));
    b.entry.items.push(li);
  });
  b.s.appendChild(list);
  root.appendChild(b.s);
}

function buildFaq(root) {
  if (!data.faq || !data.faq.length) return;
  const b = sec('faq', 'Questions', data.faq.length + '');
  const list = el('div', 'abt-faq');
  data.faq.forEach((f) => {
    const d = el('details', 'abt-q');
    d.appendChild(txt('summary', null, f.q));
    d.appendChild(txt('p', null, f.a));
    list.appendChild(mark(d));
    b.entry.items.push(d);
  });
  b.s.appendChild(list);
  root.appendChild(b.s);
}

function buildLinks(root) {
  const ls = (data.links || []).filter((l) => l && l.u);
  if (!ls.length) return;
  const row = el('div', 'abt-links');
  ls.forEach((l) => {
    const a = el('a', 'abt-link');
    a.href = l.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = l.l || l.u;
    row.appendChild(a);
  });
  root.appendChild(row);
}

function apply() {
  const q = input.value.trim().toLowerCase();
  let shownTotal = 0, all = 0;
  secs.forEach((s) => {
    let shown = 0;
    s.items.forEach((it) => {
      all++;
      const okq = !q || it.dataset.q.indexOf(q) >= 0;
      const okc = !it.dataset.c || cat === 'all' || it.dataset.c === cat;
      const vis = okq && okc;
      it.classList.toggle('nope', !vis);
      if (vis) shown++;
    });
    s.el.classList.toggle('nope', shown === 0);
    if (s.nav) s.nav.classList.toggle('nope', shown === 0);
    shownTotal += shown;
  });
  groups.forEach((g) => {
    g.el.classList.toggle('nope', !g.items.some((i) => !i.classList.contains('nope')));
  });
  const filtering = q || cat !== 'all';
  countEl.textContent = !filtering ? '' : (shownTotal ? shownTotal + ' of ' + all + ' matching' : 'Nothing matches');
  countEl.classList.toggle('none', filtering && !shownTotal);
}

function render() {
  const root = $('aboutView');
  root.textContent = '';
  secs.length = 0;
  groups.length = 0;
  const wrap = el('div', 'abt');
  buildHero(wrap);
  const nav = buildSearch(wrap);
  buildFacts(wrap);
  buildStory(wrap);
  buildName(wrap);
  buildTimeline(wrap);
  buildDisc(wrap);
  buildPhotos(wrap);
  buildPairs(wrap, 'people', 'Collaborators', data.credits, (x) => x.w, (x) => x.r);
  buildPairs(wrap, 'live', 'Live', data.live, (x) => x.w + ' · ' + x.d, (x) => x.x);
  buildPairs(wrap, 'honors', 'Charts and awards', data.honors, (x) => x.w, (x) => x.x);
  buildPairs(wrap, 'gear', 'How he makes it', data.gear, (x) => x.k, (x) => x.v);
  buildTrivia(wrap);
  buildFaq(wrap);
  buildLinks(wrap);
  buildJump(nav);
  root.appendChild(wrap);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || !input || path() !== '/about') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  input.focus();
  input.select();
});

export function onShowAbout() {
  if (built) return;
  load().then(() => { built = true; render(); });
}
