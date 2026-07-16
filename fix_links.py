#!/usr/bin/env python3
"""Rewrite genuine internal <a> href attributes whose (query/fragment-stripped) base path
is a known wrong/redirecting path, repointing to the canonical in-clone target.
Skips <script> blocks (x-templates/JSON-LD). Preserves any query/fragment on the href.
Handles root-relative and absolute-internal forms. Only touches .html files under site/."""
import os, re, json

ROOT = 'site'
INTERNAL_HOSTS = {'www.hanoverresearch.com','hanoverresearch.com','hanoverresearch-clone.vercel.app'}
plan = json.load(open('fix_plan.json'))
FIX = plan['fix']  # base_path -> target_path

script_re = re.compile(r'<script\b[^>]*>.*?</script>', re.I | re.S)
# genuine href attr (double or single quoted), not a binding (:/-/word before 'href')
href_re = re.compile(r'(?<![:\-\w])href\s*=\s*(["\'])(.*?)\1', re.I)

def base_of(href):
    """Return (base_path, suffix) where suffix is query+fragment; or (None,None) if not internal."""
    frag=''; q=''
    h=href
    if '#' in h: h,frag = h.split('#',1); frag='#'+frag
    if '?' in h: h,q = h.split('?',1); q='?'+q
    # normalize to root-relative path
    if h.startswith('/') and not h.startswith('//'):
        return h, q+frag
    m=re.match(r'^https?://([^/]+)(/.*)?$', h, re.I)
    if m and m.group(1).lower() in INTERNAL_HOSTS:
        return (m.group(2) or '/'), q+frag
    m=re.match(r'^//([^/]+)(/.*)?$', h)
    if m and m.group(1).lower() in INTERNAL_HOSTS:
        return (m.group(2) or '/'), q+frag
    return None, None

changed_files=0
total_repl=0
per_target={}
detail_rows=[]  # (file, old_href, new_href)

html_files=[]
for dp,_,fns in os.walk(ROOT):
    for fn in fns:
        if fn.endswith('.html'):
            html_files.append(os.path.join(dp,fn))

for fpath in html_files:
    html=open(fpath,encoding='utf-8',errors='surrogatepass').read()
    # compute script spans to skip
    spans=[(m.start(),m.end()) for m in script_re.finditer(html)]
    def in_script(pos):
        for a,b in spans:
            if a<=pos<b: return True
        return False
    repl_count=[0]
    def do(m):
        pos=m.start()
        if in_script(pos):
            return m.group(0)
        quote=m.group(1); val=m.group(2)
        base,suffix = base_of(val)
        if base is None:
            return m.group(0)
        tgt = FIX.get(base)
        if tgt is None:
            return m.group(0)
        newval = tgt + (suffix or '')
        repl_count[0]+=1
        per_target[base]=per_target.get(base,0)+1
        if len(detail_rows)<40 or True:
            detail_rows.append((fpath, val, newval))
        return f'href={quote}{newval}{quote}'
    new_html = href_re.sub(do, html)
    if repl_count[0]>0:
        open(fpath,'w',encoding='utf-8',errors='surrogatepass').write(new_html)
        changed_files+=1
        total_repl+=repl_count[0]

print(f'Files changed: {changed_files}')
print(f'Total href replacements: {total_repl}')
print(f'Distinct source paths rewritten: {len(per_target)}')
# save a mapping report
json.dump({'files_changed':changed_files,'total_replacements':total_repl,
           'per_source_path':per_target}, open('fix_applied.json','w'), indent=1)
print('wrote fix_applied.json')
