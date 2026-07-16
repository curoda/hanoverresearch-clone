#!/usr/bin/env python3
"""build_batch.py — build ONLY the new pages from a batch manifest into site/, then merge
the batch entries into the master pages.json. Reuses mirror.py's rewrite/force_show/inject_fixes
so the new pages get the same treatment (asset+internal-link URL rewrite incl. escaped-slash
Elementor JS base, forced abst-show-page, clone-fixes.js) as the rest of the mirror.

Does NOT rebuild existing pages (preserves any manual edits already committed).
Also rewrites CSS files newly downloaded in this batch (origin url() -> root-relative).

Usage: python3 build_batch.py <batch_manifest.json> [<newcss.txt>]
"""
import json, os, sys
import mirror  # reuse rewrite(), force_show(), inject_fixes(), ORIGIN_PATTERNS, collapse_wp_slashes


def build_pages(manifest):
    built = 0
    for p in manifest:
        if not p.get('ok'):
            continue
        raw_file = os.path.join('raw', p['slug'] + '.html')
        if not os.path.exists(raw_file):
            continue
        out = os.path.join('site', p['sitepath'])
        text = open(raw_file, encoding='utf-8').read()
        text = mirror.rewrite(text)
        text = mirror.force_show(text)
        text = mirror.inject_fixes(text)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(text)
        built += 1
    return built


def rewrite_css_files(paths):
    n = 0
    for fp in paths:
        if not fp or not fp.endswith('.css') or not os.path.exists(fp):
            continue
        try:
            css = open(fp, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        orig = css
        for pat in mirror.ORIGIN_PATTERNS:
            css = css.replace(pat, '')
        css = mirror.collapse_wp_slashes(css)
        if css != orig:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(css)
            n += 1
    return n


def merge_pages_json(manifest):
    master = []
    if os.path.exists('pages.json'):
        master = json.load(open('pages.json'))
    by_url = {p['url']: p for p in master}
    for p in manifest:
        by_url[p['url']] = p  # new/updated entry wins
    merged = list(by_url.values())
    with open('pages.json', 'w') as f:
        json.dump(merged, f, indent=1)
    return len(merged)


def main():
    manifest = json.load(open(sys.argv[1]))
    newcss = []
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        newcss = [l.strip() for l in open(sys.argv[2]) if l.strip()]
    built = build_pages(manifest)
    css_n = rewrite_css_files(newcss)
    total = merge_pages_json(manifest)
    ok = sum(1 for p in manifest if p.get('ok'))
    fail = sum(1 for p in manifest if not p.get('ok'))
    print(f'built {built} new pages; rewrote {css_n} new css; batch ok={ok} fail={fail}; pages.json total={total}')


if __name__ == '__main__':
    main()
