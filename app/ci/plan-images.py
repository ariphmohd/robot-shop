#!/usr/bin/env python3
"""Select affected Docker build contexts from a GitHub Actions event."""
import json
import os
from pathlib import Path
import re
import subprocess

SERVICES = ("catalogue", "cart", "dispatch", "payment", "ratings", "shipping", "user", "web", "mysql")
PIPELINE_PATHS = {
    "app/ci/tests/test_image_planning.py",
    ".github/workflows/container-images.yml",
    "app/ci/plan-images.py",
}

def select_services(paths, force_all=False):
    if force_all or any(p in PIPELINE_PATHS for p in paths):
        return list(SERVICES)
    selected = set()
    for path in paths:
        if path.startswith("app/dev/"):
            # Local preview tooling is not included in any service image.
            continue
        parts = path.split("/")
        if len(parts) >= 3 and parts[0] == "app" and parts[1] in SERVICES:
            selected.add(parts[1])
        elif path.startswith("app/") and (len(parts) < 3 or parts[1] not in SERVICES):
            # Shared application configuration may affect multiple services.
            return list(SERVICES)
    return [s for s in SERVICES if s in selected]

def pending_services(revision, root, infra_root):
    """Compare app history with image source revisions in the separate GitOps repo."""
    overlay = Path(infra_root) / "k8s/overlays/kind"
    if not overlay.is_dir():
        raise ValueError("Missing infrastructure checkout: k8s/overlays/kind")
    pending = set()
    for service in SERVICES:
        pattern = re.compile(r"robotshop-kind/" + re.escape(service) + r":sha-([0-9a-f]{12})-[0-9]+-[0-9]+")
        matches = [m.group(1) for path in overlay.glob("*.yaml")
                   for m in pattern.finditer(path.read_text())]
        if len(matches) != 1:
            pending.add(service)
            continue
        result = subprocess.run(
            ["git", "diff", "--name-only", "--no-renames", matches[0], revision, "--"],
            cwd=root, capture_output=True, text=True,
        )
        if result.returncode != 0 or service in select_services(result.stdout.splitlines()):
            # Missing baseline history rebuilds safely. Shared changes carry forward too.
            pending.add(service)
    return pending

def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    name = os.environ["GITHUB_EVENT_NAME"]
    force_all = name == "workflow_dispatch"
    if name == "pull_request":
        before, after = event["pull_request"]["base"]["sha"], event["pull_request"]["head"]["sha"]
    else:
        before, after = event.get("before", ""), os.environ["GITHUB_SHA"]
    paths = []
    if not force_all:
        if not re.fullmatch(r"[0-9a-f]{40}", before) or set(before) == {"0"}:
            force_all = True
        else:
            diff = subprocess.run(
                ["git", "diff", "--name-only", "--no-renames", before, after],
                capture_output=True, text=True
            )
            if diff.returncode:
                force_all = True
            else:
                paths = diff.stdout.splitlines()
    services = select_services(paths, force_all)
    if name == "push":
        infra_root = os.environ.get("INFRA_ROOT")
        if not infra_root:
            raise SystemExit("INFRA_ROOT must point to the separate infrastructure checkout")
        pending = pending_services(after, Path(__file__).resolve().parents[2], Path(infra_root))
        services = [s for s in SERVICES if s in set(services) | pending]
    sha = os.environ["GITHUB_SHA"]
    run = os.environ["GITHUB_RUN_ID"]
    attempt = os.environ["GITHUB_RUN_ATTEMPT"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or not run.isdigit() or not attempt.isdigit():
        raise SystemExit("Unexpected GitHub run identity")
    tag = f"sha-{sha[:12]}-{run}-{attempt}"
    output = {
        "services": json.dumps(services, separators=(",", ":")),
        "has_changes": str(bool(services)).lower(),
        "image_tag": tag,
    }
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as stream:
        for key, value in output.items():
            stream.write(f"{key}={value}\n")
    print(f"Build services: {', '.join(services) or '(none)'}")
    print(f"Image tag: {tag}")

if __name__ == "__main__":
    main()
