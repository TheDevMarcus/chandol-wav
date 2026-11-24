const subs = [];

export function path() {
  const p = location.pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function fire() {
  subs.forEach((fn) => fn(path()));
}

export function onRoute(fn) {
  subs.push(fn);
}

export function go(to, replace) {
  const next = '/' + String(to || '').replace(/^[#/]+/, '').replace(/\/+$/, '');
  if (next === path()) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', next + location.search);
  fire();
}

export function migrateHash() {
  const h = location.hash;
  if (!h || h.length < 2) return;
  const raw = h.slice(1).replace(/\/+$/, '');
  if (raw.startsWith('song/')) {
    const slug = raw.slice(5);
    history.replaceState(null, '', '/?song=' + encodeURIComponent(slug));
    return;
  }
  history.replaceState(null, '', '/' + raw);
}

export function initRouter() {
  window.addEventListener('popstate', fire);
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    if (/^\/song\//.test(href)) return;
    e.preventDefault();
    go(href);
  });
}
