#!/usr/bin/env python3
"""mirror.py — build the deployable static mirror in site/ from raw/<slug>.html.

Rewrites www.hanoverresearch.com asset + internal-link URLs to root-relative paths
(assets already downloaded to site/<original-path> by download_assets.js), while
KEEPING canonical / og:url / og:image / twitter:image / JSON-LD absolute (faithful
metadata). Forces body class `abst-show-page` so the A/B-test plugin's opacity:0 hide
rule never blanks the page on the static host. Collapses double slashes in /wp-* paths.
External hosts (HubSpot, Termly, GTM, Zoom, Workday, Salesforce, LinkedIn, etc.) kept as-is.
"""
import json, os, re, html

ORIGIN_PATTERNS = [
    'https://www.hanoverresearch.com',
    'http://www.hanoverresearch.com',
    '//www.hanoverresearch.com',
    'https://hanoverresearch.com',
    'http://hanoverresearch.com',
]

def protect(text):
    """Replace regions that must stay absolute with tokens; return (text, store)."""
    store = []
    def stash(m):
        store.append(m.group(0)); return f"\x00PROT{len(store)-1}\x00"
    # JSON-LD blocks
    text = re.sub(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>.*?</script>', stash, text, flags=re.S|re.I)
    # canonical / og:url / og:image(:secure_url) / twitter:image / og:site url etc.
    text = re.sub(r'<link[^>]*rel=["\']canonical["\'][^>]*>', stash, text, flags=re.I)
    text = re.sub(r'<meta[^>]*property=["\']og:url["\'][^>]*>', stash, text, flags=re.I)
    text = re.sub(r'<meta[^>]*property=["\']og:image(:secure_url)?["\'][^>]*>', stash, text, flags=re.I)
    text = re.sub(r'<meta[^>]*name=["\']twitter:image["\'][^>]*>', stash, text, flags=re.I)
    return text, store

def restore(text, store):
    for i, val in enumerate(store):
        text = text.replace(f"\x00PROT{i}\x00", val)
    return text

def collapse_wp_slashes(text):
    # collapse 2+ slashes after /wp-content or /wp-includes or /uploads segment
    text = re.sub(r'(/wp-(?:content|includes))/{2,}', r'\1/', text)
    text = re.sub(r'(/uploads)/{2,}', r'\1/', text)
    return text

def rewrite(text):
    text, store = protect(text)
    for pat in ORIGIN_PATTERNS:
        text = text.replace(pat, '')
    # after stripping, protocol-relative leftovers for other subdomains untouched.
    text = collapse_wp_slashes(text)
    text = restore(text, store)
    return text

def force_show(text):
    # add abst-show-page to <body class="...">
    def repl(m):
        cls = m.group(1)
        if 'abst-show-page' in cls: return m.group(0)
        return f'<body class="abst-show-page {cls}"'
    new = re.sub(r'<body class="([^"]*)"', repl, text, count=1)
    if new == text and '<body' in text:
        new = text.replace('<body', '<body class="abst-show-page"', 1)
    return new

def main():
    pages = json.load(open('pages.json'))
    built = 0
    for p in pages:
        if not p.get('ok'): continue
        raw_file = os.path.join('raw', p['slug'] + '.html')
        if not os.path.exists(raw_file): continue
        text = open(raw_file, encoding='utf-8').read()
        text = rewrite(text)
        text = force_show(text)
        out = os.path.join('site', p['sitepath'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(text)
        built += 1
    print(f'built {built} pages')

if __name__ == '__main__':
    main()
