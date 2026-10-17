#!/usr/bin/env python3
"""Inspect and clean private ECR repositories selected by a name prefix.

The script is dry-run by default. Use --execute to make changes.

Use "purge-images" before `terraform destroy` to keep Terraform state in sync:
it removes image manifests but leaves repositories for Terraform to delete.
Use "delete-repositories" only when Terraform is not managing those
repositories, because deleting them outside Terraform creates state drift.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterable

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect, purge, or force-delete private ECR repositories by prefix."
    )
    parser.add_argument(
        "--repository-prefix",
        required=True,
        help="Only repositories whose names start with this value are selected, for example robotshop-dev/.",
    )
    parser.add_argument(
        "--action",
        choices=("purge-images", "delete-repositories"),
        default="purge-images",
        help="purge-images is Terraform-safe; delete-repositories force-deletes repositories and images.",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", "us-east-1"),
        help="AWS Region containing the private repositories. Default: AWS_REGION or us-east-1.",
    )
    parser.add_argument(
        "--profile",
        help="Optional AWS shared-configuration profile name.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Perform the selected action. Without this flag, the script only prints a dry-run report.",
    )
    return parser.parse_args()


def chunked(items: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def selected_repositories(ecr_client, prefix: str) -> list[dict]:
    paginator = ecr_client.get_paginator("describe_repositories")
    repositories: list[dict] = []

    for page in paginator.paginate():
        repositories.extend(
            repository
            for repository in page.get("repositories", [])
            if repository["repositoryName"].startswith(prefix)
        )

    return sorted(repositories, key=lambda repository: repository["repositoryName"])


def image_digests(ecr_client, repository_name: str) -> list[str]:
    paginator = ecr_client.get_paginator("describe_images")
    digests: list[str] = []

    for page in paginator.paginate(repositoryName=repository_name):
        digests.extend(
            image["imageDigest"]
            for image in page.get("imageDetails", [])
            if "imageDigest" in image
        )

    return digests


def purge_images(ecr_client, repository_name: str, digests: list[str]) -> None:
    for digest_batch in chunked(digests, 100):
        ecr_client.batch_delete_image(
            repositoryName=repository_name,
            imageIds=[{"imageDigest": digest} for digest in digest_batch],
        )


def main() -> int:
    args = parse_arguments()
    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    ecr_client = session.client(
        "ecr",
        config=Config(retries={"total_max_attempts": 3, "mode": "standard"}),
    )

    try:
        repositories = selected_repositories(ecr_client, args.repository_prefix)
        if not repositories:
            print(f"No ECR repositories matched prefix: {args.repository_prefix}")
            return 0

        mode = "EXECUTE" if args.execute else "DRY RUN"
        print(f"{mode}: action={args.action}, region={args.region}")

        for repository in repositories:
            name = repository["repositoryName"]
            digests = image_digests(ecr_client, name)
            image_count = len(digests)
            print(f"{name}: {image_count} image manifest(s)")

            if not args.execute:
                continue

            if args.action == "purge-images":
                if image_count:
                    purge_images(ecr_client, name, digests)
                    print(f"  Deleted {image_count} image manifest(s); repository retained for Terraform.")
                continue

            ecr_client.delete_repository(repositoryName=name, force=True)
            print(f"  Force-deleted repository and {image_count} image manifest(s).")

        return 0
    except (BotoCoreError, ClientError) as error:
        print(f"AWS ECR operation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
