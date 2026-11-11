#!/bin/bash
set -euo pipefail
umask 077

[[ $(hostname) == spc-discourse ]]
exec 9>/run/lock/spc-discourse-update.lock
flock -n 9
cd /var/discourse

# Keep an independent SMTP configuration available if the container cannot start.
docker exec --user discourse --env RAILS_ENV=production --workdir /var/www/discourse app \
  bin/rails runner /shared/spc-discourse-alert-config.rb > /etc/spc-discourse-alert.json.new
python3 -m json.tool /etc/spc-discourse-alert.json.new >/dev/null
mv /etc/spc-discourse-alert.json.new /etc/spc-discourse-alert.json

# Keep images used by containers; remove unused images before checking free space.
docker image prune --all --force

# Leave room for the backup, database dump and replacement Docker image.
available_bytes=$(df --output=avail -B1 /var/discourse | tail -1)
if (( available_bytes < 10737418240 )); then
  printf 'ERROR: Low disk space on /var/discourse after image cleanup: %s MiB available; 10240 MiB (10 GiB) required. Backup and update aborted.\n' "$((available_bytes / 1048576))" >&2
  exit 1
fi
marker=$(mktemp)
trap 'rm -f "$marker"' EXIT
docker exec --user discourse --env RAILS_ENV=production --workdir /var/www/discourse app bundle exec ruby script/discourse backup
backup=$(find shared/standalone/backups/default -maxdepth 1 -type f -name '*.tar.gz' -newer "$marker" -print -quit)
[[ -n $backup && -s $backup ]]
gzip -t "$backup"
echo "Verified full backup: $backup"

if [[ ${1:-} == --backup-only ]]; then
  exit 0
fi

./launcher rebuild app
curl --fail --silent --show-error --retry 30 --retry-delay 10 --retry-all-errors --max-time 15 \
  --resolve community.swissphotoclub.com:443:127.0.0.1 https://community.swissphotoclub.com/srv/status
echo "Discourse rebuild and HTTPS health check completed."
