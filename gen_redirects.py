#!/usr/bin/env python3
import json, re
plan = json.load(open('fix_plan.json'))
fix = plan['fix']  # old -> new (both resolve; new is a real clone page)
clean = re.compile(r'^/[A-Za-z0-9][A-Za-z0-9/_.-]*/?$')
redirects = []
skipped = []
seen = set()
for old, new in sorted(fix.items()):
    if not clean.match(old):
        skipped.append(old); continue
    if old == new or old in seen:
        continue
    seen.add(old)
    redirects.append({"source": old,
                      "destination": new,
                      "permanent": True})
# also add non-slash source variant handling is automatic via trailingSlash; keep slashless source to match both
cfg = {"cleanUrls": True, "trailingSlash": True, "redirects": redirects}
json.dump(cfg, open('site/vercel.json','w'), indent=2)
print(f"redirects written: {len(redirects)}")
print(f"skipped malformed sources (href already fixed in HTML): {len(skipped)}")
for s in skipped: print("   skip:", s)
