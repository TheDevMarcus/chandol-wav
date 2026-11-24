
const TAG_RE = /[\[(]([^\])]*)[\])]/g;
const TRAIL_V_RE = /\s+v(\d+)\s*$/i;
const VARIANT_RE = /\b(inst|instrumental|acapella|a cappella|acoustic|remix|mix|atmos|dolby|demo|live|snippet|slowed|sped|reverb|edit|stems?|cover|unfinished|latin|uke|interlude|session)\b/i;

function tags(title) {
  const out = [];
  String(title).replace(TAG_RE, (_, inner) => { out.push(inner.trim()); return ''; });
  const m = String(title).replace(TAG_RE, ' ').trim().match(TRAIL_V_RE);
  if (m) out.unshift('ver' + m[1]);
  return out.filter(Boolean);
}

export function baseTitle(title) {
  return String(title).replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim().replace(TRAIL_V_RE, '')
    .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const isReleased = (t) => !!t.meta || String(t.status).toLowerCase() === 'released';
const versionNum = (t) => {
  let n = 0;
  tags(t.name).forEach((g) => { const m = g.match(/^v(\d+)$/i); if (m) n = Math.max(n, Number(m[1])); });
  return n;
};
const isVariant = (t) => tags(t.name).some((g) => !/^v(er)?\d+$/i.test(g) && VARIANT_RE.test(g));

function rank(t) {
  if (isReleased(t)) return 0;
  if (String(t.status).toLowerCase() === 'old version') return 3;
  return isVariant(t) ? 2 : 1;
}

function label(t) {
  if (isReleased(t)) return 'Released';
  const g = tags(t.name).map((x) => (/^ver\d+$/i.test(x) ? 'Version ' + x.slice(3) : /^v\d+$/i.test(x) ? x.toUpperCase() : x));
  if (String(t.status).toLowerCase() === 'old version') g.unshift('Old version');
  return g.length ? g.join(' · ') : 'Original';
}

export function groupVersions(tracks) {
  const groups = new Map();
  tracks.forEach((t) => {
    const key = t.artistKey + '|' + (t.sid || baseTitle(t.name));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  groups.forEach((list) => {
    if (list.length < 2) return;
    list.sort((a, b) => rank(a) - rank(b) || versionNum(b) - versionNum(a) || a.name.length - b.name.length);
    list.forEach((t) => { t.vgroup = list; t.vlabel = label(t); });
  });
}

export function collapseVersions(list) {
  const inList = new Set(list);
  const seen = new Set();
  const out = [];
  list.forEach((t) => {
    if (!t.vgroup) { out.push(t); return; }
    if (seen.has(t.vgroup)) return;
    seen.add(t.vgroup);
    out.push(t.vgroup.find((v) => inList.has(v)) || t);
  });
  return out;
}

export const releasedOf = (t) => (t.vgroup ? t.vgroup.find(isReleased) || null : null);
