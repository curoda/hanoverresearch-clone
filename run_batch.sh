#!/usr/bin/env bash
# run_batch.sh <NN> — run one full batch: fetch raw HTML, download new assets, build+merge,
# update urls.txt, commit+push. Stops immediately (exit 3) if either origin phase reports BLOCKED.
set -uo pipefail
NN="$1"
BATCH="batches/batch_${NN}.txt"
MAN="batches/manifest_${NN}.json"
FAIL="batches/failures_${NN}.txt"
[ -f "$BATCH" ] || { echo "no such batch $BATCH"; exit 1; }

echo "=================== BATCH ${NN}: FETCH ($(wc -l < "$BATCH") urls) ==================="
node batch_fetch.js "$BATCH" "$MAN"
rc=$?
if [ $rc -eq 3 ]; then echo "!!! BATCH ${NN} BLOCKED during fetch. Stopping."; exit 3; fi
if [ $rc -ne 0 ]; then echo "!!! BATCH ${NN} fetch failed rc=$rc"; exit $rc; fi

echo "=================== BATCH ${NN}: ASSETS ==================="
node batch_assets.js "$MAN" "$FAIL"
rc=$?
if [ $rc -eq 3 ]; then echo "!!! BATCH ${NN} BLOCKED during assets. Stopping."; exit 3; fi
if [ $rc -ne 0 ]; then echo "!!! BATCH ${NN} assets failed rc=$rc"; exit $rc; fi

echo "=================== BATCH ${NN}: BUILD ==================="
python3 build_batch.py "$MAN" "${FAIL%.txt}.newcss.txt"
rc=$?
if [ $rc -ne 0 ]; then echo "!!! BATCH ${NN} build failed rc=$rc"; exit $rc; fi

# append successfully-mirrored urls to urls.txt (dedup)
python3 - "$MAN" <<'PY'
import json,sys
man=json.load(open(sys.argv[1]))
done=set(l.strip() for l in open('urls.txt') if l.strip())
add=[p['url'] for p in man if p.get('ok') and p['url'] not in done]
if add:
    with open('urls.txt','a') as f:
        for u in add: f.write(u+'\n')
print(f'urls.txt += {len(add)}')
PY

echo "=================== BATCH ${NN}: COMMIT ==================="
git add -A
git commit -q -m "Mirror batch ${NN}: $(python3 -c "import json;m=json.load(open('$MAN'));print(sum(1 for p in m if p.get('ok')),'pages ok,',sum(1 for p in m if not p.get('ok')),'skipped')")" || echo "(nothing to commit)"
git push origin HEAD 2>&1 | tail -2
echo "=================== BATCH ${NN} DONE ==================="
