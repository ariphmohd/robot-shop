#!/usr/bin/env bash
# Create a missing Secret from hidden terminal input; never overwrite an existing Secret.
set -euo pipefail
context="${ROBOTSHOP_CONTEXT:-kind-robot-shop-test}"
namespace=robot-shop
if [[ $# -eq 1 && "$1" == "--help" ]]; then
  printf 'Usage: bash scripts/kind/create-secret.sh SECRET_NAME KEY\n'
  printf 'Allowed pairs: catalogue-mongodb MONGO_URL; user-mongodb MONGO_URL; mysql-auth MYSQL_ROOT_PASSWORD\n'
  exit 0
fi
[[ $# -eq 2 ]] || { printf 'Expected SECRET_NAME KEY; use --help.\n' >&2; exit 2; }
name="$1"
key="$2"
case "$name:$key" in
  catalogue-mongodb:MONGO_URL|user-mongodb:MONGO_URL|mysql-auth:MYSQL_ROOT_PASSWORD) ;;
  *) printf 'Unsupported Secret/key pair.\n' >&2; exit 2 ;;
esac
kubectl --context "$context" get namespace "$namespace" >/dev/null
if kubectl --context "$context" -n "$namespace" get secret "$name" >/dev/null 2>&1; then
  printf 'Secret %s already exists. Left unchanged; this helper only creates missing Secrets.\n' "$name" >&2
  exit 1
fi
[[ -t 0 ]] || { printf 'Run interactively in a terminal; do not pipe credentials into this helper.\n' >&2; exit 1; }
secret_value=""
trap 'unset secret_value' EXIT
IFS= read -r -s -p "Enter value for $name/$key (hidden): " secret_value
printf '\n'
[[ -n "$secret_value" ]] || { printf 'Empty input: no Secret created.\n' >&2; exit 1; }
if [[ "$key" == MONGO_URL && "$secret_value" != mongodb+srv://* ]]; then
  printf 'Expected a complete mongodb+srv:// URI; no Secret created.\n' >&2
  exit 1
fi
printf '%s' "$secret_value" | kubectl --context "$context" -n "$namespace" create secret generic "$name" --from-file="$key=/dev/stdin"
unset secret_value
printf 'Verify safely: kubectl --context %s -n %s describe secret %s\n' "$context" "$namespace" "$name"
