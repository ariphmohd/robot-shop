#!/usr/bin/env python3
"""Refresh the local Kind ECR pull Secret without printing or saving credentials."""
import base64
import json
import os
import subprocess

CONTEXT = "kind-robot-shop-test"
NAMESPACE = "robot-shop"
REGISTRY = "542697646590.dkr.ecr.us-east-1.amazonaws.com"

def main():
    # Capture the token in memory, never in argv, a temporary file, or Git.
    env = dict(os.environ, AWS_PAGER="")
    token = subprocess.run(
        ["aws", "ecr", "get-login-password", "--region", "us-east-1"],
        check=True, capture_output=True, text=True, env=env, timeout=60,
    ).stdout.strip()
    if not token:
        raise RuntimeError("AWS returned an empty ECR token")
    config = {"auths": {REGISTRY: {"auth": base64.b64encode(
        ("AWS:" + token).encode()).decode()}}}
    secret = {
        "apiVersion": "v1", "kind": "Secret",
        "metadata": {"name": "ecr-pull", "namespace": NAMESPACE},
        "type": "kubernetes.io/dockerconfigjson",
        "data": {".dockerconfigjson": base64.b64encode(json.dumps(config).encode()).decode()},
    }
    result = subprocess.run(
        ["kubectl", "--context", CONTEXT, "apply", "--server-side",
         "--field-manager=ecr-secret-refresh", "-f", "-"],
        input=json.dumps(secret), capture_output=True, text=True, timeout=60,
    )
    # Do not echo API errors: they can include the submitted Secret payload.
    if result.returncode:
        raise RuntimeError("Secret refresh failed; check context, namespace, API access, and Secret ownership")
    print("Refreshed robot-shop/ecr-pull (ECR token valid for 12 hours)")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("ECR Secret refresh failed. Check local AWS authentication and Kind connectivity; no credentials were printed.")
