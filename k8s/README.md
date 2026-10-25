# Kubernetes configuration

## Working Kind environment

The active GitOps source is **k8s/overlays/kind** on **codex/kind-test**.
The Argo CD Application and AppProject are in **k8s/argocd/kind**.

Argo CD reads the overlay and manages robot-shop resources. The Application
bootstrap now declares automatic sync; applying it activates that policy.
Pruning and self-healing remain disabled. See the
[CI/CD activation guide](../docs/kind-ci-cd.md) before enabling automation.

See the [full recreation and recovery runbook](../docs/kind-recovery.md)
before installing, recovering storage, or rebuilding a cluster.

### Entry points

- base/: shared namespace definition; contains no application workloads.
- overlays/kind/: all validated local application resources.
- argocd/kind/: Kind-only Application and Project bootstrap.
- overlays/dev/ and the top-level argocd/*.yaml files: older main/dev scaffold,
  not the Kind bootstrap.

### Fresh-cluster order

1. Create/reuse the cluster and verify local storage.
2. Recreate missing Atlas/root Secrets outside Git.
3. Load the exact ECR images into all Kind nodes.
4. Install the pinned Argo CD and Traefik charts.
5. For automatic deployment, apply only the Kind bootstrap after prerequisites
   are ready. For a manual recovery preview, use the disabled-auto-sync bootstrap
   procedure in the recovery runbook:

```bash
kubectl --context kind-robot-shop-test apply -k k8s/argocd/kind
```

6. Verify Argo CD Diff and Synced/Healthy; use manual sync only if auto-sync
   was deliberately disabled for recovery. Leave Prune, Force, and Replace off.
7. Restore backed-up database data if required and verify the application.

### Existing-cluster updates

Commit manifest edits, push, review Argo Diff, and sync. Do not routinely apply
the workload overlay outside Argo CD after adoption. A new image tag must be
available through the ECR pull Secret or preloaded for manual recovery before
the corresponding pods start.

### Secret references

| Resource | Existing Secret | Key |
|---|---|---|
| catalogue Deployment | catalogue-mongodb | MONGO_URL |
| user Deployment | user-mongodb | MONGO_URL |
| mysql StatefulSet | mysql-auth | MYSQL_ROOT_PASSWORD |

The Kind AppProject does not permit applying Secret objects. Values remain
manually managed; this does not mean Argo CD's controller service account cannot
read Secrets. Never add a secret-value export to this tree.

The MariaDB claim comes from a StatefulSet volumeClaimTemplate. It preserves
data across pod replacement while the claim survives; it is not a backup.
