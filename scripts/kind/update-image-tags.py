#!/usr/bin/env python3
"""Update selected ECR image references without changing unrelated workloads."""
import argparse
import json
from pathlib import Path
import re

SERVICES = {"catalogue", "cart", "dispatch", "payment", "ratings", "shipping", "user", "web", "mysql"}
TAG = re.compile(r"sha-[0-9a-f]{12}-[0-9]+-[0-9]+")
IMAGE_LINE = re.compile(r"^([ \t]*image:[ \t]*)([^ \t\n#]+)([^\n]*)$", re.MULTILINE)

def update_tags(overlay, registry, prefix, services, tag):
    if not TAG.fullmatch(tag):
        raise ValueError("Expected immutable sha-<12 hex>-<run id>-<attempt> tag")
    if not services or len(services) != len(set(services)) or not set(services) <= SERVICES:
        raise ValueError("Services must be unique names from the existing build matrix")
    if not re.fullmatch(r"[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com", registry):
        raise ValueError("Unexpected ECR registry")
    if prefix != "robotshop-kind":
        raise ValueError("This updater is restricted to robotshop-kind repositories")
    found = {service: 0 for service in services}
    changes = {}
    base = f"{registry}/{prefix}/"
    for path in sorted(Path(overlay).glob("*.yaml")):
        original = path.read_text()
        def replace(match):
            image = match.group(2)
            if not image.startswith(base):
                return match.group(0)
            service, separator, old_tag = image[len(base):].partition(":")
            if service not in found:
                return match.group(0)
            if not separator or not old_tag:
                raise ValueError(f"Expected tagged image for {service}")
            found[service] += 1
            return f"{match.group(1)}{base}{service}:{tag}{match.group(3)}"
        updated = IMAGE_LINE.sub(replace, original)
        if updated != original:
            changes[path] = updated
    if any(count != 1 for count in found.values()):
        raise ValueError(f"Expected exactly one image per selected service; found {found}")
    # Validate the complete update before writing any file.
    for path, contents in changes.items():
        path.write_text(contents)
    return changes

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--services", required=True, help="JSON array from the build planner")
    parser.add_argument("--registry", required=True)
    parser.add_argument("--prefix", default="robotshop-kind")
    args = parser.parse_args()
    services = json.loads(args.services)
    if not isinstance(services, list) or not all(isinstance(s, str) for s in services):
        parser.error("--services must be a JSON array of strings")
    overlay = Path(__file__).resolve().parents[2] / "k8s/overlays/kind"
    changed = update_tags(overlay, args.registry, args.prefix, services, args.tag)
    print(f"Updated {len(changed)} files for: {', '.join(services)}")

if __name__ == "__main__":
    main()
