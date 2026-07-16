#!/usr/bin/env python3
import os, re, json
ROOT='site'
allf=set()
for dp,_,fns in os.walk(ROOT):
  for fn in fns: allf.add('/'+os.path.relpath(os.path.join(dp,fn),ROOT).replace(os.sep,'/'))
def norm(path):
    return path.split('#',1)[0].split('?',1)[0]
def resolves(path):
    path=norm(path)
    if path in ('','/'): return '/index.html' in allf
    if not path.startswith('/'): return False
    p=re.sub(r'/{2,}','/',path); s=p.rstrip('/')
    return any(c in allf for c in (p,s,s+'/index.html',s+'.html'))

cat=json.load(open('link_categories.json'))
chains=json.load(open('redir_chains.json'))
broken=json.load(open('broken_links.json'))

fix=dict((k,v[0]) for k,v in cat['FIX'].items())  # path -> target
redir_to_404=[]        # origin-side: redirect ends at /404/
redir_final_unmirrored=[]  # final 200 but page not in clone (coverage gap)
for p,info in chains.items():
    fs=info['finalStatus']; fu=info['finalUrl']
    finalpath=fu.replace('https://www.hanoverresearch.com','')
    if not finalpath.startswith('/'): finalpath='/'+finalpath
    nref=len(broken.get(p,[]))
    if str(fs)=='404' or norm(finalpath)=='/404/':
        redir_to_404.append((p,nref,finalpath))
    elif str(fs)=='200' and resolves(finalpath):
        fix[p]=norm(finalpath)   # add to fixable (drop query for static host)
    else:
        redir_final_unmirrored.append((p,nref,finalpath,fs))

# LIVE_200 and ORIGIN_404 unchanged
live200=cat['LIVE_200_UNMIRRORED']
origin404=cat['ORIGIN_404']

# total link instances that will be rewritten
tot_fix_links=sum(len(broken.get(p,[])) for p in fix)
print('FINAL FIX map: %d distinct paths / %d link instances to rewrite' % (len(fix), tot_fix_links))
print('redir_to_404 (origin-side broken):', len(redir_to_404), 'paths /', sum(x[1] for x in redir_to_404),'links')
print('redir_final_unmirrored (coverage gap via redirect):', len(redir_final_unmirrored),'paths /', sum(x[1] for x in redir_final_unmirrored),'links')
print('LIVE_200_UNMIRRORED (correct href, page not mirrored):', len(live200),'paths /', sum(x[1] for x in live200),'links')
print('ORIGIN_404 (broken on origin too):', len(origin404),'paths /', sum(x[1] for x in origin404),'links')

json.dump({'fix':fix,
           'redir_to_404':redir_to_404,
           'redir_final_unmirrored':redir_final_unmirrored,
           'live200':live200,
           'origin404':origin404}, open('fix_plan.json','w'), indent=1)
print('\nwrote fix_plan.json')
print('\n=== redir_to_404 detail ===')
for p,n,fp in redir_to_404: print(f'  {n:3d}  {p}')
print('\n=== redir_final_unmirrored detail ===')
for p,n,fp,fs in redir_final_unmirrored: print(f'  {n:3d}  {p}  -> {fp} ({fs})')
