export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';

export function songSlugs(tracks) {
  const groups = new Map();
  tracks.forEach((t) => {
    const k = slugify(t.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  });
  const out = new Map();
  groups.forEach((list, k) => {
    if (list.length === 1) { out.set(list[0], k); return; }
    const seen = new Map();
    list.forEach((t) => {
      const s = k + '-' + slugify(t.artistKey || t.artist);
      const n = (seen.get(s) || 0) + 1;
      seen.set(s, n);
      out.set(t, n > 1 ? s + '-' + n : s);
    });
  });
  return out;
}
