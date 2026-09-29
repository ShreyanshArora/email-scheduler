#!/usr/bin/env bash
set -euo pipefail
umask 077
output="${1:?Pass a private backup destination directory}"
mkdir -p "$output"
file="$output/reachinbox-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose --env-file .env.production -f compose.production.yml exec -T postgres pg_dump -U reachinbox -d reachinbox | gzip > "$file"
gzip -t "$file"
echo "Database backup saved to $file"
