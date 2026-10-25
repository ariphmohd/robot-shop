#!/usr/bin/env bash
# Read-only logical dump of the two application databases, stored outside the repository.
set -euo pipefail
umask 077
context="${ROBOTSHOP_CONTEXT:-kind-robot-shop-test}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${1:-}" == "--help" ]]; then
  printf 'Usage: bash scripts/kind/backup-mysql.sh [EXISTING_BACKUP_DIRECTORY]\n'
  printf 'Default: $HOME/robot-shop-private/backups; outputs sensitive gzip SQL plus SHA256.\n'
  exit 0
fi
[[ $# -le 1 ]] || { printf 'Too many arguments.\n' >&2; exit 2; }
backup_dir="${1:-$HOME/robot-shop-private/backups}"
mkdir -p -- "$backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd -P)"
repo_root="$(cd -- "$repo_root" && pwd -P)"
case "$backup_dir/" in
  "$repo_root/"*) printf 'Backup destination must be outside the repository.\n' >&2; exit 1 ;;
esac
chmod 700 -- "$backup_dir"
filename="robotshop-mysql-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.gz"
partial="$backup_dir/$filename.partial"
final="$backup_dir/$filename"
trap 'rm -f -- "$partial"' EXIT
kubectl --context "$context" -n robot-shop exec mysql-0 -- /bin/sh -c   'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --quick --routines --events --triggers --hex-blob --databases cities ratings'   | gzip > "$partial"
gzip -t -- "$partial"
mv -- "$partial" "$final"
(cd -- "$backup_dir" && sha256sum "$filename" > "$filename.sha256")
printf 'Backup: %s\nChecksum: %s.sha256\n' "$final" "$final"
printf 'This file is NOT encrypted. Store a protected copy off this WSL host. Restore testing is still required.\n'
