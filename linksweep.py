#!/usr/bin/env python3
"""Site-wide internal broken-link sweep for the static mirror in site/.
Resolves each internal <a href> against files on disk using Vercel's
cleanUrls + trailingSlash semantics. Reports hrefs that match no real page/asset.
"""
import os, re, sys, json
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
INTERNAL_HOSTS = {'www.hanoverresearch.com', 'hanoverresearch.com', 'hanoverresearch-clone.vercel.app'}

# Build a set of all files present (relative to ROOT, using forward slashes, leading '/')
all_files = set()
for dirpath, dirnames, filenames in os.walk(ROOT):
    for fn in filenames:
        rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, '/')
        all_files.add('/' + rel)

def resolves(path):
    """Return True if a root-relative path resolves to a file on disk (Vercel cleanUrls+trailingSlash)."""
    # strip query and fragment
    path = path.split('#',1)[0].split('?',1)[0]
    if path == '':
        return True
    if not path.startswith('/'):
        return None  # not root-relative; handled by caller
    # normalize away any accidental double slashes
    p = re.sub(r'/{2,}', '/', path)
    stripped = p.rstrip('/')
    candidates = [
        p,                              # exact file
        stripped,                       # exact file no trailing slash
        stripped + '/index.html',       # directory index
        stripped + '.html',             # cleanUrls
    ]
    if p == '/':
        candidates.append('/index.html')
    for c in candidates:
        if c in all_files:
            return True
    return False

# genuine href attribute only: not preceded by ':' (:href / v-bind:href / xlink:href),
# '-' (data-href), or a word char. Excludes Vue/x-template bindings.
href_re = re.compile(r'<a\b[^>]*?(?<![:\-\w])href\s*=\s*"([^"]*)"', re.I)
# strip <script>...</script> so x-templates / JSON-LD don't produce false positives
script_re = re.compile(r'<script\b[^>]*>.*?</script>', re.I | re.S)

# Aggregate: broken_path -> set of files, and count
broken = defaultdict(set)
internal_link_count = 0
checked_files = 0

html_files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    for fn in filenames:
        if fn.endswith('.html'):
            html_files.append(os.path.join(dirpath, fn))

for fpath in html_files:
    checked_files += 1
    try:
        html = open(fpath, encoding='utf-8', errors='replace').read()
    except Exception as e:
        continue
    relf = '/' + os.path.relpath(fpath, ROOT).replace(os.sep, '/')
    html = script_re.sub('', html)  # drop script blocks (x-templates, JSON-LD)
    for m in href_re.finditer(html):
        href = m.group(1).strip()
        if not href:
            continue
        low = href.lower()
        # skip non-navigational schemes
        if low.startswith(('mailto:', 'tel:', 'sms:', 'javascript:', 'data:', '#')):
            continue
        # normalize absolute internal URLs to path
        path = None
        if href.startswith('/') and not href.startswith('//'):
            path = href
        elif re.match(r'^https?://', href, re.I):
            m2 = re.match(r'^https?://([^/]+)(/.*)?$', href, re.I)
            host = m2.group(1).lower()
            if host in INTERNAL_HOSTS:
                path = m2.group(2) or '/'
            else:
                continue  # external, out of scope
        elif href.startswith('//'):
            # protocol-relative
            m2 = re.match(r'^//([^/]+)(/.*)?$', href)
            host = m2.group(1).lower()
            if host in INTERNAL_HOSTS:
                path = m2.group(2) or '/'
            else:
                continue
        else:
            # relative link (rare in this mirror) - resolve against file dir
            base = os.path.dirname(relf)
            path = os.path.normpath(os.path.join(base, href)).replace(os.sep,'/')
            if not path.startswith('/'):
                path = '/' + path
        internal_link_count += 1
        r = resolves(path)
        if r is False:
            broken[path.split('#',1)[0].split('?',1)[0]].add(relf)

print(f"HTML files scanned: {checked_files}")
print(f"Internal links checked: {internal_link_count}")
print(f"Distinct broken internal target paths: {len(broken)}")
print("="*70)
# sort by number of referencing files desc
for path, files in sorted(broken.items(), key=lambda kv: -len(kv[1])):
    print(f"\nBROKEN: {path}   (referenced by {len(files)} file(s))")
    for f in sorted(files)[:5]:
        print(f"    e.g. {f}")
    if len(files) > 5:
        print(f"    ... and {len(files)-5} more")

# dump full json for follow-up
out = {p: sorted(list(fs)) for p,fs in broken.items()}
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'broken_links.json'),'w'), indent=1)
print("\nWrote broken_links.json")
