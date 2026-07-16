#!/usr/bin/env python3
"""asset_integrity.py — for every built page in site/, extract root-relative asset references
(link/script/img src, srcset, CSS url()) and verify the file exists on disk. Any referenced
same-domain asset that is missing AND was not recorded as a source-side 404 is a potential
clone defect. Prints a summary and writes missing_assets_report.txt.
"""
import os, re, json, glob, urllib.parse
from collections import Counter

SITE = 'site'

# known source-side 404 asset URLs (paths) from all batch failure logs + prior asset_failures
source404 = set()
for fp in glob.glob('batches/failures_*.txt') + ['asset_failures.txt']:
    if os.path.exists(fp):
        for line in open(fp, errors='ignore'):
            line = line.strip()
            m = re.match(r'^\d{3}\s+(\S+)', line)
            if m:
                try:
                    source404.add(urllib.parse.urlparse(m.group(1)).path)
                except Exception:
                    pass
# also the two task-known origin 404 images
source404.add('/wp-content/uploads/2017/12/Puzzlepieces_720x390-002-300x163.jpg')
source404.add('/wp-content/plugins/bb-bt-ab/img/split-conversion.svg')

ATTR = re.compile(r'(?:href|src|data-src|data-lazy-src|data-large_image|poster|data-thumbnail|data-thumb|data-bg|data-background|data-bg-url|data-lazy-srcset)\s*=\s*"([^"]+)"', re.I)
SRCSET = re.compile(r'(?:srcset|data-srcset|imagesrcset)\s*=\s*"([^"]+)"', re.I)
URLCSS = re.compile(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', re.I)
ASSET_EXT = re.compile(r'\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|pdf)(\?|$)', re.I)

def collect_refs(html):
    refs = set()
    for m in ATTR.finditer(html):
        refs.add(m.group(1))
    for m in SRCSET.finditer(html):
        for part in m.group(1).split(','):
            u = part.strip().split()[0] if part.strip() else ''
            if u:
                refs.add(u)
    for m in URLCSS.finditer(html):
        refs.add(m.group(1))
    return refs

def is_local_asset(ref):
    ref = ref.strip().replace('&amp;', '&')
    if not ref or ref.startswith('data:') or ref.startswith('#') or ref.startswith('mailto:') or ref.startswith('tel:'):
        return None
    # absolute origin -> treat as local path
    for pre in ('https://www.hanoverresearch.com', 'http://www.hanoverresearch.com',
                'https://hanoverresearch.com', 'http://hanoverresearch.com'):
        if ref.startswith(pre):
            ref = ref[len(pre):] or '/'
            break
    if ref.startswith('http') or ref.startswith('//'):
        return None  # other external host
    if not ref.startswith('/'):
        return None  # relative fragment
    path = ref.split('?')[0].split('#')[0]
    if not ASSET_EXT.search(path):
        return None
    return path

missing = Counter()
missing_pages = {}
pages_checked = 0
for f in glob.glob(os.path.join(SITE, '**', 'index.html'), recursive=True):
    pages_checked += 1
    html = open(f, encoding='utf-8', errors='ignore').read()
    for ref in collect_refs(html):
        path = is_local_asset(ref)
        if not path:
            continue
        disk = os.path.join(SITE, urllib.parse.unquote(path.lstrip('/')))
        if not os.path.exists(disk):
            missing[path] += 1
            missing_pages.setdefault(path, f)

# classify
clone_defects = {p: c for p, c in missing.items() if p not in source404}
known_src = {p: c for p, c in missing.items() if p in source404}

print(f'pages checked: {pages_checked}')
print(f'distinct missing local assets: {len(missing)}')
print(f'  known source-side 404 (faithful, leave missing): {len(known_src)}')
print(f'  POTENTIAL CLONE DEFECTS (missing, not known-404): {len(clone_defects)}')
with open('missing_assets_report.txt', 'w') as out:
    out.write('== POTENTIAL CLONE DEFECTS (missing on disk, not a known source-side 404) ==\n')
    for p, c in sorted(clone_defects.items(), key=lambda x: -x[1]):
        out.write(f'{c}\t{p}\t(e.g. {missing_pages[p]})\n')
    out.write('\n== KNOWN SOURCE-SIDE 404 (faithful) ==\n')
    for p, c in sorted(known_src.items(), key=lambda x: -x[1]):
        out.write(f'{c}\t{p}\n')
# download list of the potential clone defects (verify against origin, download if 200)
with open('missing_to_fetch.txt', 'w') as out:
    for p in sorted(clone_defects):
        out.write(p + '\n')
print('\nTop potential clone defects:')
for p, c in sorted(clone_defects.items(), key=lambda x: -x[1])[:40]:
    print(f'  {c:4}  {p}')
