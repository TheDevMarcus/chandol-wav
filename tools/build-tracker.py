#!/usr/bin/env python3
"""Build data/tracker-index.json for the site from the Charley Yang tracker.

    python3 tools/build-tracker.py            # uses data/tracker.xlsx (run xlsx2json first) ...
    python3 tools/build-tracker.py --fetch    # ... or download the sheet fresh first

Only song info is kept (era, name, version, alt names, credits, notes, dates, type, portion,
quality, tags). The tracker's Link(s) column is NOT copied.
"""
import datetime, json, os, re, subprocess, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'

if '--fetch' in sys.argv:
    url = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx'
    print('downloading tracker...')
    subprocess.run(['curl', '-sL', '-o', os.path.join(DATA, 'tracker.xlsx'), url], check=True)
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'xlsx2json.py'),
                    os.path.join(DATA, 'tracker.xlsx'), os.path.join(DATA, 'tracker')], check=True)

rows = json.load(open(os.path.join(DATA, 'tracker', 'unreleased.json')))
T = lambda c: (c['text'] if isinstance(c, dict) else (c or '')).strip()

TAGS = {'⭐': 'best', '🏆': 'grail', '🥇': 'wanted', '🗑': 'worst', '🤖': 'ai'}

def clean_title(s):
    tags = [v for k, v in TAGS.items() if k in s]
    for k in TAGS: s = s.replace(k, '')
    s = s.replace('️', '').strip()
    return s, tags

def base_key(s):
    s = re.sub(r'[\[(][^\])]*[\])]', ' ', s)
    s = re.sub(r'\s+v\d+\s*$', ' ', s, flags=re.I)
    s = s.replace('*', '')
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

EPOCH = datetime.date(1899, 12, 30)
MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}

def to_date(s):
    """'46324.0' (sheet serial) or 'May 4th, 2023' / 'Jan 5, 2017' -> '2023-05-04'; '' if unknown."""
    s = (s or '').strip()
    if not s or s in ('-', '?', 'N/A'): return ''
    if re.fullmatch(r'\d{4,6}(\.\d+)?', s):
        d = EPOCH + datetime.timedelta(days=int(float(s)))
        return d.isoformat() if 1990 < d.year < 2100 else ''
    m = re.match(r'([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})', s)
    if m and m.group(1).lower() in MONTHS:
        try: return datetime.date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()
        except ValueError: return ''
    m = re.match(r'([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$', s)
    if m and m.group(1).lower() in MONTHS: return f'{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}'
    m = re.fullmatch(r'(\d{4})', s)
    return m.group(1) if m else ''

def parse_counts(text):
    out = {}
    for line in text.split('\n'):
        m = re.match(r'\s*(\d+)\s+(.+?)\s*$', line)
        if m: out[m.group(2).replace('(s)', '').strip().lower()] = int(m.group(1))
    return out

hdr = [T(c) for c in rows[0]]
col = {h.replace('\n', ' '): i for i, h in enumerate(hdr)}
def get(r, name):
    i = col.get(name)
    return T(r[i]) if i is not None and i < len(r) else ''

eras, era_summary, songs = [], {}, []
for r in rows[1:]:
    first = T(r[0]) if r else ''
    if re.search(r'\d+ Full', first):
        name = T(r[1]) if len(r) > 1 else ''
        if name: era_summary[name.rstrip('.').strip()] = parse_counts(first)
        continue
    name_cell = get(r, 'Name')
    if not name_cell: continue
    era = get(r, 'Era').rstrip('.').strip()
    lines = [l.strip() for l in name_cell.split('\n') if l.strip()]
    title, tags = clean_title(lines[0])
    ver = (re.search(r'\[(V\d+)\]', title, re.I) or [None, ''])[1].upper()
    aka, credits, extra = [], {}, []
    for l in lines[1:]:
        if re.match(r'aka[.,:]?\s', l, re.I):
            aka += [a.strip(' *') for a in re.split(r',\s*', re.sub(r'^aka[.,:]?\s*', '', l, flags=re.I)) if a.strip(' *')]
        elif re.search(r'\((prod|writ|feat|with|ref|perf)\.', l, re.I):
            for k, v in re.findall(r'\((prod|writ|feat|with|ref|perf)\.\s*([^)]*)\)', l, re.I):
                credits.setdefault(k.lower(), []).append(v.strip())
        else:
            extra.append(l)
    if era and era not in eras: eras.append(era)
    songs.append({
        'id': len(songs),
        'era': era,
        'title': title,
        'ver': ver,
        'key': base_key(title),
        'akaKeys': [base_key(a) for a in aka],
        'aka': aka,
        'credits': credits,
        'extra': extra,
        'tags': tags,
        'notes': get(r, 'Notes') if get(r, 'Notes') not in ('-', '') else '',
        'length': get(r, 'Track Length') if get(r, 'Track Length') not in ('-', '') else '',
        'fileDate': to_date(get(r, 'File Date')),
        'leakDate': to_date(get(r, 'Leak Date')),
        'type': get(r, 'Type'),
        'portion': get(r, 'Portion'),
        'quality': get(r, 'Quality'),
        'comment': get(r, 'Comment(s)'),
    })

out = {
    'source': f'https://docs.google.com/spreadsheets/d/{SHEET_ID}',
    'built': datetime.datetime.now().isoformat(timespec='minutes'),
    'eras': [{'name': e, 'counts': era_summary.get(e, {}), 'songs': sum(1 for s in songs if s['era'] == e)} for e in eras],
    'songs': songs,
}
path = os.path.join(DATA, 'tracker-index.json')
with open(path, 'w') as fh: json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
print(f'{len(songs)} songs in {len(eras)} eras -> data/tracker-index.json ({os.path.getsize(path) // 1024} KB)')
print('eras:', ', '.join(f"{e['name']} ({e['songs']})" for e in out['eras']))
print('with leak date:', sum(1 for s in songs if s['leakDate']), '| with file date:', sum(1 for s in songs if s['fileDate']),
      '| with alt names:', sum(1 for s in songs if s['aka']), '| tagged:', sum(1 for s in songs if s['tags']))
