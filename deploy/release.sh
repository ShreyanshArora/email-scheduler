#!/usr/bin/env bash
set -euo pipefail
# Run from the existing server checkout; production secrets stay on the server.
revision="${1:?Pass the full Git commit SHA to deploy}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full commit SHA'; exit 1; }
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
test -f .env.production
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'Server checkout contains tracked changes; refusing to overwrite them'; exit 1
fi
git fetch origin main
git merge-base --is-ancestor "$revision" origin/main
previous="$(git rev-parse HEAD)"
git checkout --detach "$revision"
compose=(docker compose --env-file .env.production -f compose.production.yml --profile https)
if ! "${compose[@]}" up --build -d; then
  git checkout --detach "$previous"
  "${compose[@]}" up --build -d
  "${compose[@]}" up -d --force-recreate web
  exit 1
fi
# Nginx resolves the API container when it starts. Recreate it after the API so
# a changed Docker IP cannot leave /health and API routes pointing at the old one.
"${compose[@]}" up -d --force-recreate web
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T web wget -q -O /dev/null http://127.0.0.1/health; then
    echo "Deployed $revision"; exit 0
  fi
  sleep 2
done
echo 'Health check failed; restoring previous application revision'
git checkout --detach "$previous"
"${compose[@]}" up --build -d
"${compose[@]}" up -d --force-recreate web
exit 1
