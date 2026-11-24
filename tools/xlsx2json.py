#!/usr/bin/env python3
"""Turn every tab of data/tracker.xlsx into data/tracker/<tab>.json (list of rows, each a list of
cell strings). Standard library only. Hyperlinks are kept as {"text":..., "url":...}."""
import json, os, re, sys, zipfile
from xml.etree import ElementTree as ET

SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/tracker.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/tracker'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
RNS = '{http://schemas.openxmlformats.org/package/2006/relationships}'

z = zipfile.ZipFile(SRC)
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).iter(RNS + 'Relationship')}

def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters: n = n * 26 + ord(ch) - 64
    return n - 1

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'sheet'

os.makedirs(OUT, exist_ok=True)
index = []
for sh in wb.find('m:sheets', NS):
    name = sh.get('name'); rid = sh.get('{%s}id' % NS['r'])
    path = 'xl/' + rels[rid].lstrip('/').replace('xl/', '', 1)
    root = ET.fromstring(z.read(path))
    links = {}
    relp = path.replace('worksheets/', 'worksheets/_rels/') + '.rels'
    srels = {}
    if relp in z.namelist():
        srels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read(relp)).iter(RNS + 'Relationship')}
    hl = root.find('m:hyperlinks', NS)
    if hl is not None:
        for h in hl:
            url = srels.get(h.get('{%s}id' % NS['r'])) or h.get('location')
            if url: links[h.get('ref')] = url
    rows = []
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            ref = c.get('r'); t = c.get('t'); v = c.find('m:v', NS); val = ''
            if t == 's' and v is not None: val = shared[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            elif v is not None: val = v.text or ''
            f = c.find('m:f', NS)
            url = links.get(ref)
            if f is not None and f.text and 'HYPERLINK' in f.text.upper():
                m = re.search(r'HYPERLINK\(\s*"([^"]+)"', f.text, re.I)
                if m: url = m.group(1)
            cells[col_index(ref)] = {'text': val, 'url': url} if url else val
        if cells:
            width = max(cells) + 1
            rows.append([cells.get(i, '') for i in range(width)])
        else:
            rows.append([])
    fn = slug(name) + '.json'
    with open(os.path.join(OUT, fn), 'w') as fh: json.dump(rows, fh, ensure_ascii=False)
    index.append({'tab': name, 'file': fn, 'rows': len(rows)})
with open(os.path.join(OUT, 'index.json'), 'w') as fh: json.dump(index, fh, ensure_ascii=False, indent=1)
for i in index: print(f"{i['rows']:5}  {i['tab']}  -> {i['file']}")
