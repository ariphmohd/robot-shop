#!/usr/bin/env bash
# Load the exact ECR images referenced by the current Kind overlay.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cluster="${ROBOTSHOP_CLUSTER:-robot-shop-test}"
region="${AWS_REGION:-us-east-1}"

usage() {
  printf 'Usage: bash scripts/kind/load-images.sh [--list]\n'
  printf 'Requires Docker image save --platform (API 1.48+), Kind, kubectl, AWS CLI.\n'
}
if [[ "${1:-}" == "--help" ]]; then usage; exit 0; fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--list" ) ]]; then usage >&2; exit 2; fi
for tool in kubectl awk sort; do command -v "$tool" >/dev/null || { printf 'Missing: %s\n' "$tool" >&2; exit 1; }; done
rendered="$(kubectl kustomize "$repo_root/k8s/overlays/kind")"
mapfile -t images < <(printf '%s\n' "$rendered" | awk '$1 == "image:" && $2 ~ /\.dkr\.ecr\./ {print $2}' | sort -u)
[[ ${#images[@]} -gt 0 ]] || { printf 'No ECR images found.\n' >&2; exit 1; }
if [[ "${1:-}" == "--list" ]]; then printf '%s\n' "${images[@]}"; exit 0; fi
for tool in aws docker kind mktemp; do command -v "$tool" >/dev/null || { printf 'Missing: %s\n' "$tool" >&2; exit 1; }; done
docker info >/dev/null
docker image save --help | grep -q -- '--platform' || { printf 'Docker must support image save --platform.\n' >&2; exit 1; }
nodes="$(kind get nodes --name "$cluster")"
[[ -n "$nodes" ]] || { printf 'Cluster has no nodes: %s\n' "$cluster" >&2; exit 1; }
architecture=""
while IFS= read -r node; do
  node_arch="$(docker exec "$node" uname -m)"
  [[ -z "$architecture" || "$architecture" == "$node_arch" ]] || { printf 'Mixed node architectures require separate archives.\n' >&2; exit 1; }
  architecture="$node_arch"
done <<< "$nodes"
case "$architecture" in
  x86_64) platform=linux/amd64 ;;
  aarch64|arm64) platform=linux/arm64 ;;
  *) printf 'Unsupported node architecture: %s\n' "$architecture" >&2; exit 1 ;;
esac
mapfile -t registries < <(printf '%s\n' "${images[@]}" | awk -F/ '{print $1}' | sort -u)
for registry in "${registries[@]}"; do
  aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"
done
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/robot-shop-images.XXXXXX")"
archive="$temp_dir/image.tar"
trap 'rm -f -- "$archive"; rmdir -- "$temp_dir"' EXIT
for image in "${images[@]}"; do
  printf '\nLoading %s for %s\n' "$image" "$platform"
  docker pull --platform "$platform" "$image"
  docker image save --platform "$platform" --output "$archive" "$image"
  kind load image-archive "$archive" --name "$cluster"
  rm -f -- "$archive"
done
printf '\nLoaded %s ECR images into %s. Public dependency images are pulled by Kubernetes.\n' "${#images[@]}" "$cluster"
