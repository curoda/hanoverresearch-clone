#!/usr/bin/env python3
import os, re, json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
INTERNAL_HOSTS = {'www.hanoverresearch.com','hanoverresearch.com','hanoverresearch-clone.vercel.app'}

all_files = set()
for dp,_,fns in os.walk(ROOT):
    for fn in fns:
        all_files.add('/'+os.path.relpath(os.path.join(dp,fn),ROOT).replace(os.sep,'/'))

def resolves(path):
    path = path.split('#',1)[0].split('?',1)[0]
    if path=='' or path=='/':
        return ('/index.html' in all_files)
    if not path.startswith('/'): return False
    p = re.sub(r'/{2,}','/',path); s=p.rstrip('/')
    for c in (p,s,s+'/index.html',s+'.html'):
        if c in all_files: return True
    return False

def loc_to_path(loc):
    if loc is None: return None
    loc=loc.strip()
    if loc.startswith('/') and not loc.startswith('//'): return loc
    m=re.match(r'^https?://([^/]+)(/.*)?$',loc,re.I)
    if m:
        if m.group(1).lower() in INTERNAL_HOSTS: return m.group(2) or '/'
        return ('EXTERNAL',loc)
    m=re.match(r'^//([^/]+)(/.*)?$',loc)
    if m:
        if m.group(1).lower() in INTERNAL_HOSTS: return m.group(2) or '/'
        return ('EXTERNAL',loc)
    return loc  # relative

probe=json.load(open('origin_probe.json'))
broken=json.load(open('broken_links.json'))

cat={'FIX':{}, 'REDIR_UNMIRRORED':{}, 'REDIR_EXTERNAL':{}, 'LIVE_200_UNMIRRORED':[], 'ORIGIN_404':[], 'OTHER':[]}
for p,info in probe.items():
    st=info.get('status'); loc=info.get('location')
    nref=len(broken.get(p,[]))
    if st in (301,302,'301','302'):
        tgt=loc_to_path(loc)
        if isinstance(tgt,tuple) and tgt[0]=='EXTERNAL':
            cat['REDIR_EXTERNAL'][p]=(loc,nref)
        elif tgt and resolves(tgt):
            cat['FIX'][p]=(tgt,nref)
        else:
            cat['REDIR_UNMIRRORED'][p]=(tgt,nref)
    elif st in (200,'200'):
        cat['LIVE_200_UNMIRRORED'].append((p,nref))
    elif str(st) in ('404','403','410'):
        cat['ORIGIN_404'].append((p,nref,st))
    else:
        cat['OTHER'].append((p,nref,st))

def tot(d):
    if isinstance(d,dict): return sum(v[1] for v in d.values())
    return sum(x[1] for x in d)

print('== SUMMARY (distinct paths / total href instances) ==')
print(f"FIX (redirect->mirrored page):        {len(cat['FIX']):4d} paths / {tot(cat['FIX']):5d} links")
print(f"REDIR_UNMIRRORED (->page not cloned): {len(cat['REDIR_UNMIRRORED']):4d} paths / {tot(cat['REDIR_UNMIRRORED']):5d} links")
print(f"REDIR_EXTERNAL (->offsite):           {len(cat['REDIR_EXTERNAL']):4d} paths / {tot(cat['REDIR_EXTERNAL']):5d} links")
print(f"LIVE_200_UNMIRRORED (real, not clone):{len(cat['LIVE_200_UNMIRRORED']):4d} paths / {tot(cat['LIVE_200_UNMIRRORED']):5d} links")
print(f"ORIGIN_404 (broken on origin too):    {len(cat['ORIGIN_404']):4d} paths / {tot(cat['ORIGIN_404']):5d} links")
print(f"OTHER:                                {len(cat['OTHER']):4d} paths / {tot(cat['OTHER']):5d} links")

json.dump(cat, open('link_categories.json','w'), indent=1)
print('\nwrote link_categories.json')

print('\n== FIX targets that themselves are ALSO in broken set (redirect chains) ==')
chain=[(p,t) for p,(t,n) in cat['FIX'].items() if t.split('#')[0].split('?')[0] in broken]
for p,t in chain[:20]: print(' ',p,'->',t)
print('  count:',len(chain))

print('\n== REDIR_UNMIRRORED (redirect target not on disk) — top 25 ==')
for p,(t,n) in sorted(cat['REDIR_UNMIRRORED'].items(),key=lambda kv:-kv[1][1])[:25]:
    print(f'  {n:4d}  {p}  ->  {t}')

print('\n== OTHER ==')
for p,n,st in cat['OTHER']: print(f'  {n:4d}  {p}  status={st}')
