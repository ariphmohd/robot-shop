# Automatic CI/CD: GitHub Actions → ECR → Git → Argo CD → Kind

This extends the running cluster. No recovery rehearsal or GitHub self-hosted
runner is required. No GitHub job receives a kubeconfig or contacts the cluster.

## How it works

1. Push application changes to `codex/kind-test`.
2. GitHub-hosted Actions select affected services, build AMD64/ARM64 images,
   and push immutable `sha-<source SHA prefix>-<run ID>-<attempt>` tags to ECR.
3. After all selected builds succeed, another GitHub-hosted job updates only
   those image references under `k8s/overlays/kind` and commits them to the branch.
4. Argo CD polls Git and automatically applies the changed Deployment manifests.
5. The Kind node's kubelet/containerd uses `robot-shop/ecr-pull` to authenticate
   to ECR, downloads missing layers, and starts the replacement pod.

Argo CD watches Git, not the ECR registry. It does not download container images.
`IfNotPresent` is retained: each release uses a new immutable tag, so an uncached
release is pulled automatically; already cached images need no repeated download.
No `docker pull`, archive export, or `kind load` is part of normal CI/CD.
The old image loader remains available for offline/manual recovery.

This is deployment after a successful build, not source hot reload. Build time,
Argo polling, image transfer, and readiness checks all take time. The workflow
finishing means desired tags were published; check Argo/pods for actual rollout.
GitHub-hosted jobs cannot verify this private local cluster directly.

A web-only edit builds web. Shared/unknown app configuration, pipeline changes,
and manual workflow runs build all nine images. Existing database volumes are
retained; rebuilding mysql does not re-import SQL into an initialized PVC.
Atlas seed files are not deployed automatically.

## 1. Create the ECR pull Secret first

Run in Ubuntu WSL as `mohd`, using your existing AWS CLI authentication and
kubeconfig. This helper creates or refreshes only `robot-shop/ecr-pull`.
It captures the token in memory and sends Secret JSON to kubectl over stdin;
no password argument, credential file, or Secret manifest is committed to Git.
The secret is stored by Kubernetes, like the existing database Secrets.
Do not run this with shell tracing or enable verbose HTTP/debug logging.

```bash
cd /home/mohd/projects/robot-shop
aws sts get-caller-identity
kubectl --context kind-robot-shop-test -n robot-shop get pods
python3 scripts/kind/refresh-ecr-secret.py
kubectl --context kind-robot-shop-test -n robot-shop describe secret ecr-pull
```

Expected type: `kubernetes.io/dockerconfigjson`, one `.dockerconfigjson` data key.
Do not print/decode the Secret. The helper never prints credential values.
An existing Secret owned by another field manager may cause an ownership
conflict; inspect metadata and resolve ownership deliberately, without force.

The local AWS identity needs `ecr:GetAuthorizationToken` on `*`, and
`ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage`, and
`ecr:GetDownloadUrlForLayer` on the account's `robotshop-kind/*` repositories.
Use a pull-only identity/profile for the timer when available. Your existing CLI
identity can be used initially if it already has those permissions. An ECR token
has the registry permissions of the IAM identity that requested it.
GitHub builds continue using the existing OIDC push role separately.

## 2. Verify an authenticated direct pull

This temporary pod uses the existing catalogue tag with `imagePullPolicy: Always`.
It requests registry resolution even if layers are cached; no image deletion or
running application replacement is necessary. The command deliberately exits
instead of starting a second catalogue server.

```bash
kubectl --context kind-robot-shop-test -n robot-shop run ecr-pull-check \
  --image=542697646590.dkr.ecr.us-east-1.amazonaws.com/robotshop-kind/catalogue:sha-e6a29b6b98d1-39600051202-1 \
  --image-pull-policy=Always --restart=Never \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"ecr-pull"}]}}' \
  --command -- node -e 'console.log("Direct ECR pull succeeded")'
kubectl --context kind-robot-shop-test -n robot-shop wait \
  --for=jsonpath='{.status.phase}'=Succeeded pod/ecr-pull-check --timeout=180s
kubectl --context kind-robot-shop-test -n robot-shop logs ecr-pull-check
kubectl --context kind-robot-shop-test -n robot-shop describe pod ecr-pull-check
```

Check events for successful pulling. Once verified:

```bash
kubectl --context kind-robot-shop-test -n robot-shop delete pod ecr-pull-check
```

If the current catalogue tag differs, copy the image reference from the Kind
catalogue manifest. For a failure, describe the pod before deleting it.

## 3. Enable local token refresh

ECR tokens expire after 12 hours. A WSL **systemd user timer**, independent of
GitHub Actions, refreshes the Secret every four hours and shortly after the user
manager starts. Failures retry every five minutes. It requires WSL/Docker/Kind,
working AWS authentication, and the user's kubeconfig; it cannot run while WSL
is shut down. Already running pods are not stopped by token expiry, but new
uncached image pulls can fail until a fresh token is available.

Check systemd first; if this fails, do not assume scheduling is installed:

```bash
systemctl --user status
```

Install the two reviewed unit files (paths assume this user's current checkout):

```bash
mkdir -p "$HOME/.config/systemd/user"
cp infra/kind/ecr-refresh.service infra/kind/ecr-refresh.timer \
  "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user start ecr-refresh.service
systemctl --user enable --now ecr-refresh.timer
systemctl --user list-timers ecr-refresh.timer
journalctl --user -u ecr-refresh.service -n 20 --no-pager
```

Keep the user manager available after terminal logout while WSL runs:

```bash
sudo loginctl enable-linger "$USER"
```

The unit sets PATH and KUBECONFIG explicitly. If AWS/kubectl are installed
elsewhere, or you use a named AWS profile, edit the installed service and add
`Environment=AWS_PROFILE=your-profile` as appropriate, then daemon-reload and
restart the service. Do not put AWS keys into a unit file. An SSO/session-based
profile still requires renewed login when its underlying session expires.
After a long shutdown, manually run the helper before deploying if necessary.
This timer renews ECR tokens; it cannot renew expired AWS login sessions.

## 4. Publish the prepared configuration

Leave repository Actions variable `KIND_CD_ENABLED` absent or `false` initially.
This gates manifest publication, while image building/pushing still runs.
The overlay now references `ecr-pull` in every Deployment and StatefulSet pod
template. The Secret itself is external to Git/Argo, so create it before syncing.
Adding the pull reference changes pod templates and causes a one-time rollout,
including mysql; its existing PVC is retained. Plan for a short local interruption.

Review changes and commit only intended files; leave `get_helm.sh` untracked:

```bash
python3 -m unittest discover -s tests -p 'test_kind_cd.py' -v
git diff --check
git add .github/workflows/container-images.yml scripts/ci/plan-images.py \
  scripts/kind/update-image-tags.py scripts/kind/refresh-ecr-secret.py \
  tests/test_kind_cd.py infra/kind/ecr-refresh.service infra/kind/ecr-refresh.timer \
  k8s/overlays/kind/kustomization.yaml k8s/argocd/kind/application.yaml \
  docs/kind-ci-cd.md docs/kind-recovery.md README.md k8s/README.md
git diff --cached --stat
git commit -m "Connect ECR image publishing to automatic Argo CD deployment"
git push origin codex/kind-test
```

In GitHub Settings → Actions → General, allow the workflow job to request
`contents: write`. Only the manifest publication job receives this permission;
build/PR jobs have read access. The branch must permit the bot's manifest commit.
If rules require PRs, use an approved bot exception or separate deployment branch
rather than disabling protections or force pushing.
Keep `AWS_ECR_PUSH_ROLE_ARN` unchanged.

## 5. Activate Argo automatic sync

After verifying direct pulls and refresh scheduling:

```bash
kubectl --context kind-robot-shop-test apply -k k8s/argocd/kind
kubectl --context kind-robot-shop-test -n argocd get application robot-shop-kind \
  -o jsonpath='{.spec.syncPolicy.automated}'
```

Expected enabled=true, prune=false, selfHeal=false, allowEmpty=false.
The bootstrap is outside the application's source path, so it needs this explicit
apply. Watch the first reconciliation and one-time pull-reference rollout.
Then set GitHub repository Actions variable **KIND_CD_ENABLED = true**.

## 6. Test a visible app change

```bash
git pull --ff-only origin codex/kind-test
```

Make a visible edit under `app/web/static/`, commit and push. Expect a web build,
ECR image push, and a bot commit changing only web's image tag. Argo polls Git,
syncs, and the node pulls the new image. Hard-refresh http://localhost afterward.
The web-only release should not restart mysql or other unchanged workloads.

```bash
kubectl --context kind-robot-shop-test -n argocd get application robot-shop-kind
kubectl --context kind-robot-shop-test -n robot-shop rollout status deployment/web --timeout=300s
kubectl --context kind-robot-shop-test -n robot-shop get pods
```

Confirm Argo reflects the bot commit and the live web image matches the new tag;
rollout status run before Argo notices Git can report the previous rollout.
Pull the bot commit into your checkout before the next edit. Never force push
over it. Bot pushes use GITHUB_TOKEN and do not trigger another push workflow;
manifest paths also fall outside the image-build trigger filters.

## Failures and pausing

| Symptom | Check |
|---|---|
| Manifest job skipped | KIND_CD_ENABLED=true, exact repository/branch, successful builds |
| Git push denied | contents write policy and branch rules |
| Superseded revision skipped | A newer source push is present; let its run publish |
| Branch advances during publication | Push fails safely; do not force push |
| Argo does not roll out | Source branch/path, auto-sync, repository access, latest Git revision |
| ImagePullBackOff | Pod events, ECR tag exists, Secret reference/type, timer and AWS login |
| Refresh fails after hours | Underlying AWS session expired, WSL stopped, cluster unavailable |
| Browser unchanged | Wait for actual new image/ready pod, hard-refresh correct URL |

Runs are serialized; newer pending runs may replace older pending runs. A
publication job refuses to replace newer source with an older image revision.
A failed build does not publish partial selected-service tags. The planner also
compares each service against the source revision in its current image tag, so
unpublished edits from failed or superseded runs are included in the next push.

Set `KIND_CD_ENABLED=false` to pause future bot publications. This does not
cancel active jobs or stop Argo applying other Git changes. Pause auto-sync
separately for maintenance:

```bash
kubectl --context kind-robot-shop-test -n argocd patch application robot-shop-kind \
  --type merge -p '{"spec":{"syncPolicy":{"automated":{"enabled":false}}}}'
```

Keep credential refresh running during ordinary maintenance. To disable its
schedule explicitly: `systemctl --user disable --now ecr-refresh.timer`.
Reapplying the bootstrap restores its declared auto-sync enabled setting.

## References

- [ECR authentication and 12-hour tokens](https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html)
- [Kubernetes image pull Secrets](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/)
- [Kind private registries](https://kind.sigs.k8s.io/docs/user/private-registries/)
- [GitHub token triggering behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [Argo automatic sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)
