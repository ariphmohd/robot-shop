# Kubernetes configuration

## Working Kind environment

The active GitOps source is **k8s/overlays/kind** on **codex/kind-test**.
The Argo CD Application and AppProject are in **k8s/argocd/kind**.

Argo CD reads the overlay and manages the existing robot-shop namespace
resources through manual sync. Automatic sync and pruning are disabled.

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
5. Apply only the Kind bootstrap:

```bash
kubectl --context kind-robot-shop-test apply -k k8s/argocd/kind
```

6. Review Argo CD Diff and manually sync without Prune, Force, or Replace.
7. Restore backed-up database data if required and verify the application.

### Existing-cluster updates

Commit manifest edits, push, review Argo Diff, and sync. Do not routinely apply
the workload overlay outside Argo CD after adoption. A new image tag must be
preloaded before the corresponding pods start.

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
