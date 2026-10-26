# ECR retention for local Kind CI images

The policy in `infra/kind/ecr-lifecycle-policy.json` keeps the newest **three
sha-tagged image versions per repository**, ordered by push time. It expires
older matching versions and untagged images older than one day. ECR performs
cleanup asynchronously, usually within 24 hours after eligibility. This is a
one-time repository setting, independent of GitHub Actions and WSL uptime.
Change countNumber in rule 1 to 2 if two versions are preferred.

Multi-platform images have an index and separate platform/attestation manifests;
more than three digest entries can be normal. Referenced platform images cannot
be expired until their manifest list is deleted. The policy retains three CI
release versions, not exactly three digest objects or a fixed byte limit.
Tags other than sha-* are not selected by the count rule.

## Before activation

ECR lifecycle rules do not consult Argo CD, Git, or running pods. An old currently
deployed image can expire if three newer versions are pushed, even when their
deployment failed or KIND_CD_ENABLED was false. Running containers continue,
but a node without the cached image cannot restart that version afterward.
Check live workloads and preview candidates before activation; if the live tag
is a candidate, deploy a retained successful version first. A Git revert alone
cannot recover an image already deleted from ECR; rebuild the source instead.
Three versions provide only a small rollback window.

Putting a policy replaces any existing policy on that repository. Check it first
and preserve/merge existing rules if present. A LifecyclePolicyNotFoundException
means there is no policy to replace; other errors need investigation.

```bash
cd /home/mohd/projects/robot-shop
aws ecr get-lifecycle-policy --region us-east-1 \
  --repository-name robotshop-kind/catalogue
```

Inspect current workload image references (no credentials):

```bash
kubectl --context kind-robot-shop-test -n robot-shop get deployments,statefulsets \
  -o custom-columns='NAME:.metadata.name,IMAGES:.spec.template.spec.containers[*].image'
```

## Preview one repository without deleting images

```bash
aws ecr start-lifecycle-policy-preview --region us-east-1 \
  --repository-name robotshop-kind/catalogue \
  --lifecycle-policy-text file://infra/kind/ecr-lifecycle-policy.json \
  --query status --output text
```

Then inspect results; repeat if status is IN_PROGRESS:

```bash
aws ecr get-lifecycle-policy-preview --region us-east-1 \
  --repository-name robotshop-kind/catalogue \
  --query '{Status:status,Summary:summary,Candidates:previewResults[*].{Tags:imageTags,Digest:imageDigest,Action:action.type,Rule:appliedRulePriority}}' \
  --output json
```

Only proceed after status COMPLETE and confirming candidates are safe to expire.
The preview does not enable automatic cleanup.

## Preview the remaining repositories

```bash
for service in cart dispatch payment ratings shipping user web mysql; do
  aws ecr start-lifecycle-policy-preview --region us-east-1 \
    --repository-name "robotshop-kind/$service" \
    --lifecycle-policy-text file://infra/kind/ecr-lifecycle-policy.json \
    --query status --output text || break
done
```

Read each result, including catalogue, and compare with live image references:

```bash
for service in catalogue cart dispatch payment ratings shipping user web mysql; do
  printf '\nRepository: robotshop-kind/%s\n' "$service"
  aws ecr get-lifecycle-policy-preview --region us-east-1 \
    --repository-name "robotshop-kind/$service" \
    --query '{Status:status,Summary:summary,Candidates:previewResults[*].{Tags:imageTags,Digest:imageDigest,Rule:appliedRulePriority}}' \
    --output json || break
done
```

Check existing policies on the other repositories as well before replacing them.
Preview results are a snapshot: rerun if intervening pushes change candidates.

## Enable cleanup after reviewing previews

The following command activates automatic deletion on all nine existing Kind
repositories. It does not affect other ECR prefixes. Use an AWS operator identity
with lifecycle-policy permissions; the CI push role needs no new permissions.

```bash
for service in catalogue cart dispatch payment ratings shipping user web mysql; do
  aws ecr put-lifecycle-policy --region us-east-1 \
    --repository-name "robotshop-kind/$service" \
    --lifecycle-policy-text file://infra/kind/ecr-lifecycle-policy.json \
    --query repositoryName --output text || break
done
```

If interrupted, some repositories may already be configured. Verify each using
get-lifecycle-policy. Future repositories need the policy applied separately.
No per-build cleanup step or additional GitHub credential is needed.

To stop future policy-based cleanup for a repository, use delete-lifecycle-policy;
this cannot restore images that have already been deleted.

## Sources

- [ECR lifecycle behavior and manifest lists](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)
- [Lifecycle rule properties](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_parameters.html)
- [Lifecycle policy preview](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lpp_creation.html)
