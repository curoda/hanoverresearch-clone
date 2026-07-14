#!/usr/bin/env bash
# push.sh — publish this repo to GitHub once a WORKING GitHub token is present.
# Idempotent: creates the repo if missing, then pushes the current branch.
# Requires GITHUB_TOKEN (or ANTHROPIC_GIT) to map to a valid GitHub credential.
set -euo pipefail
OWNER="curoda"
REPO="hanoverresearch-clone"
TOKEN="${GITHUB_TOKEN:-${ANTHROPIC_GIT:-}}"
[ -n "$TOKEN" ] || { echo "No GITHUB_TOKEN/ANTHROPIC_GIT set"; exit 1; }

# 1. sanity check the token
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" https://api.github.com/user)
if [ "$code" != "200" ]; then echo "Token not valid yet (/user -> $code). Aborting."; exit 1; fi

# 2. create the repo if it does not exist
if [ "$(curl -s -o /dev/null -w '%{http_code}' https://api.github.com/repos/$OWNER/$REPO)" = "404" ]; then
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d '{"name":"'"$REPO"'","description":"Static mirror clone of hanoverresearch.com","private":false}' >/dev/null
  echo "Created $OWNER/$REPO"
fi

# 3. push (embed token; if the egress gateway swaps raw Basic this works, otherwise the
#    credential helper handles it when ANTHROPIC_GIT is populated)
BR=$(git branch --show-current)
git remote set-url origin "https://x-access-token:$TOKEN@github.com/$OWNER/$REPO.git" 2>/dev/null \
  || git remote add origin "https://x-access-token:$TOKEN@github.com/$OWNER/$REPO.git"
git push -u origin "$BR"
echo "Pushed $BR to https://github.com/$OWNER/$REPO"
