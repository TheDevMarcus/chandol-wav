import json, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
rows = json.load(open(os.path.join(ROOT, 'data/tracker/unreleased.json')))
idx = json.load(open(os.path.join(ROOT, 'data/tracker-index.json')))
MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
EV = re.compile(r'\(([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)')
def iso(mon, day, year):
    m = MONTHS.get(mon[:3].lower())
    if mon.lower().startswith('janu'): m = 1
    return f'{year}-{m:02d}-{int(day):02d}' if m else ''
heads = {}
for r in rows:
    if len(r) > 2 and isinstance(r[1], str) and r[1].strip() and isinstance(r[2], str) and (re.search(r'\d+ (OG|Total|Full|Snippet)', str(r[0])) or (r[0] == '' and r[2].startswith('('))):
        heads.setdefault(r[1].strip(), r[2])
eras = []
chandol = False
norm = lambda n: re.sub(r'[^a-z0-9]', '', n.lower().replace('boywithuke:', '').replace(' era', ''))
counts = {norm(e['name']): e.get('songs', 0) for e in idx['eras']}
for hname in heads:
    e = {'name': hname, 'songs': counts.get(norm(hname), 0)}
    name = e['name'].strip()
    if name.lower().startswith('mercurial'): chandol = True
    text = heads[hname]
    events = []
    for mon, day, year, what in EV.findall(text or ''):
        d = iso(mon, day, year)
        if d: events.append({'date': d, 'text': what.strip()})
    rel = next((ev['date'] for ev in events if re.search(r'\bis released\b', ev['text'], re.I)), '')
    note = '' if events else (text or '').strip().split('\n')[0][:140]
    eras.append({'name': name.rstrip('. ').replace(' era', '').replace('Pre-Soundcloud', 'Pre-SoundCloud'), 'artist': 'chandol' if chandol else 'boywithuke',
                 'released': rel, 'start': events[0]['date'] if events else '', 'note': note,
                 'events': [ev for i, ev in enumerate(events) if i < 3 or re.search(r'is released', ev['text'], re.I)][:6], 'trackerSongs': e.get('songs', 0)})
json.dump(eras, open(os.path.join(ROOT, 'data/eras.json'), 'w'), indent=1, ensure_ascii=False)
for e in eras: print(e['artist'][:4], '|', e['name'], '|', e['released'] or e['start'] or '-', '|', len(e['events']), 'events |', e['trackerSongs'], '| note:', e['note'][:50])
