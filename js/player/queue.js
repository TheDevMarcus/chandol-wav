
import { $, fmt, showAnimated, hideAnimated } from '../core/util.js';
import { state, on, emit } from '../core/state.js';
import { play } from './player.js';

const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const GRIP_SVG = '<svg viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>';

let nextInsert = 0;
export function playNext(t) {
  state.upNext.splice(Math.min(nextInsert, state.upNext.length), 0, t);
  nextInsert++;
  emit('queuechange');
}
export function addToQueue(t) {
  [].concat(t).forEach((x) => state.upNext.push(x));
  emit('queuechange');
}
export function removeFromQueue(i) {
  state.upNext.splice(i, 1);
  if (i < nextInsert) nextInsert--;
  emit('queuechange');
}
export function clearQueue() {
  state.upNext.length = 0;
  nextInsert = 0;
  emit('queuechange');
}
function moveInQueue(from, to) {
  if (from === to) return;
  const [t] = state.upNext.splice(from, 1);
  state.upNext.splice(to, 0, t);
  emit('queuechange');
}

const context = () => state.queue || state.view;
export const contextName = () => state.queueName || (state.queue ? 'your selection' : 'Tracks');

function upcoming(limit) {
  const view = context();
  let pos = view.indexOf(state.tracks[state.cur]);
  if (pos < 0 && state.lastCtx) pos = view.indexOf(state.lastCtx);
  const out = view.slice(pos + 1, pos + 1 + limit);
  if (out.length < limit && state.repeatMode === 'all' && pos > 0) out.push(...view.slice(0, Math.min(pos, limit - out.length)));
  return out;
}

function row(t, opts) {
  const li = document.createElement('li');
  if (opts.animate) { li.className = 'enter'; li.style.setProperty('--i', String(Math.min(opts.n || 0, 14))); }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qrow' + (opts.current ? ' active' : '') + (opts.queued ? ' queued' : '');
  const th = document.createElement('span'); th.className = 'qthumb';
  if (t.cover) {
    const img = document.createElement('img');
    img.alt = ''; img.loading = 'lazy';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.remove();
    img.src = t.cover;
    th.appendChild(img);
  }
  const tx = document.createElement('span'); tx.className = 'qtx';
  const a = document.createElement('b'); a.textContent = t.name;
  const s = document.createElement('i'); s.textContent = t.artist + (t.dur ? ' · ' + fmt(t.dur) : '');
  tx.append(a, s);
  b.append(th, tx);
  b.onclick = opts.onPlay;
  li.appendChild(b);
  if (opts.queued) {
    li.classList.add('qitem');
    li.draggable = true;
    li.dataset.qi = String(opts.qi);
    const grip = document.createElement('span');
    grip.className = 'qgrip'; grip.innerHTML = GRIP_SVG; grip.title = 'Drag to reorder';
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'qrm'; rm.innerHTML = X_SVG;
    rm.title = 'Remove from queue'; rm.setAttribute('aria-label', 'Remove ' + t.name + ' from queue');
    rm.onclick = (e) => { e.stopPropagation(); removeFromQueue(opts.qi); };
    li.prepend(grip);
    li.appendChild(rm);
  }
  return li;
}

function heading(text, extra) {
  const li = document.createElement('li');
  li.className = 'qhead';
  const h = document.createElement('span');
  h.textContent = text;
  li.appendChild(h);
  if (extra) li.appendChild(extra);
  return li;
}

export function renderQueueInto(ul, animate) {
  if (!ul) return;
  ul.textContent = '';
  let n = 0;
  const cur = state.tracks[state.cur];
  if (cur) {
    ul.appendChild(heading('Now playing'));
    ul.appendChild(row(cur, { current: true, animate, n: n++, onPlay: () => {} }));
  }
  if (state.upNext.length) {
    const clr = document.createElement('button');
    clr.type = 'button'; clr.className = 'qclear'; clr.textContent = 'Clear';
    clr.onclick = clearQueue;
    ul.appendChild(heading('Next in queue', clr));
    state.upNext.forEach((t, i) => ul.appendChild(row(t, {
      queued: true, qi: i, animate, n: n++,
      onPlay: () => { removeFromQueue(i); play(state.tracks.indexOf(t)); },
    })));
  }
  const next = upcoming(30);
  if (next.length) {
    ul.appendChild(heading('Next from ' + contextName() + (state.shuffleOn ? ' · shuffle is on' : '')));
    next.forEach((t) => ul.appendChild(row(t, { animate, n: n++, onPlay: () => play(state.tracks.indexOf(t)) })));
  }
  if (!cur && !state.upNext.length && !next.length) {
    const li = document.createElement('li');
    li.className = 'qempty';
    li.textContent = 'Nothing queued. Use ⋯ on any song → Play next or Add to queue.';
    ul.appendChild(li);
  }
  enableDrag(ul);
}

function enableDrag(ul) {
  let from = -1;
  ul.querySelectorAll('.qitem').forEach((li) => {
    li.addEventListener('dragstart', (e) => {
      from = Number(li.dataset.qi);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(from)); } catch (err) {}
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); ul.querySelectorAll('.dropover').forEach((x) => x.classList.remove('dropover')); });
    li.addEventListener('dragover', (e) => { if (from < 0) return; e.preventDefault(); li.classList.add('dropover'); });
    li.addEventListener('dragleave', () => li.classList.remove('dropover'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = Number(li.dataset.qi);
      if (from >= 0 && to >= 0) moveInQueue(from, to);
      from = -1;
    });
  });
}

let pop, list, btn, isOpen = false;

export function openQueuePop() {
  if (isOpen) return;
  isOpen = true;
  emit('popup', 'queue');
  btn.classList.add('active');
  btn.setAttribute('aria-expanded', 'true');
  renderQueueInto(list, true);
  showAnimated(pop);
  const a = list.querySelector('.qrow.active');
  if (a) list.scrollTop = 0;
}
export function closeQueuePop() {
  if (!isOpen) return;
  isOpen = false;
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
  hideAnimated(pop, 200);
}

function updateBadge() {
  const n = state.upNext.length;
  btn.dataset.count = n ? String(n) : '';
  btn.classList.toggle('has', n > 0);
}

export function initQueue() {
  btn = $('queueBtn');
  if (!btn) return;
  const wrap = document.createElement('div');
  wrap.className = 'qp-wrap';
  pop = document.createElement('section');
  pop.className = 'qp';
  pop.hidden = true;
  pop.setAttribute('aria-label', 'Queue');
  pop.innerHTML = '<div class="qp-head"><h3><svg viewBox="0 0 24 24"><path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/></svg>Queue</h3></div>';
  list = document.createElement('ul');
  list.className = 'qp-list';
  pop.appendChild(list);
  wrap.appendChild(pop);
  document.body.appendChild(wrap);

  btn.onclick = () => (isOpen ? closeQueuePop() : openQueuePop());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { closeQueuePop(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'q' || e.key === 'Q') btn.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !pop.contains(e.target) && !e.target.closest('.dock') && !e.target.closest('.cmenu')) closeQueuePop();
  });
  on('popup', (who) => { if (who !== 'queue') closeQueuePop(); });

  const refresh = () => {
    updateBadge();
    if (isOpen) renderQueueInto(list, false);
    const ov = $('ovQueue');
    if (ov && !ov.hidden) renderQueueInto($('ovQueueList'), false);
  };
  on('queuechange', (why) => {
    if (why === 'shift' && nextInsert > 0) nextInsert--;
    refresh();
  });
  on('trackchange', (t) => {
    if (context().includes(t)) state.lastCtx = t;
    refresh();
  });
  updateBadge();
}
