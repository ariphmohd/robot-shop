# Robot Shop Kind recreation and recovery runbook

Validated configuration: 25 October 2026. Run commands in **Ubuntu/WSL Bash**,
not PowerShell, from the repository root unless otherwise stated. Copy commands
only, not terminal prompts or example output.

## 1. Choose the correct recovery path

| Situation | What to do |
|---|---|
| One pod failed; cluster and PVC still exist | Use section 12; do not rebuild the cluster |
| Entire Kind cluster was deleted; Atlas/ECR still exist | Sections 3–8, then MariaDB restore if preserving changed data |
| Prepare for maintenance | Take and protect backups using section 10 |
| ECR images or publisher IAM were deleted | Section 13 before loading application images |
| Atlas was deleted or data overwritten | Atlas recovery, section 11 |
| Only Argo CD was lost | Reinstall its chart and bootstrap; retain application resources |

**Git restores configuration, ECR supplies binaries, and backups restore data.**
Do not delete a cluster, namespace, or PVC as an initial troubleshooting step.

## 2. Inventory and recovery boundaries

| Item | Current configuration |
|---|---|
| Git repository | https://github.com/ariphmohd/robot-shop.git |
| Branch | codex/kind-test |
| Kind | v0.33.0 |
| Kubernetes | v1.33.0; node-image digest in infra/kind/kind-config.yaml |
| Cluster / context | robot-shop-test / kind-robot-shop-test |
| Application namespace | robot-shop |
| Argo CD | chart 10.11.1 / application v3.5.6, namespace argocd |
| Traefik | chart 42.1.3 / application v3.7.16, namespace traefik |
| AWS account / region | 542697646590 / us-east-1 |
| ECR repository prefix | robotshop-kind/ |
| Initial validated image tag | sha-e6a29b6b98d1-39600051202-1 |
| Storefront | http://localhost through HTTP ingress |
| Argo CD UI | HTTPS port-forward; local port 8085 suggested |

The current Git manifests, rather than the tag in this table, are authoritative.
There are ten Deployments and one MariaDB StatefulSet: eleven application and
dependency pods. Argo CD and Traefik are additional infrastructure pods.

| State | Location | Pod replacement | Kind deletion |
|---|---|---|---|
| Desired configuration | Pushed Git commits | Retained | Retained |
| Application binaries | ECR, subject to retention/deletion | Retained | Retained |
| Preloaded images | Each Kind node's image store | Usually retained on same node | Lost |
| Three manual Secrets | Kubernetes etcd | Retained | Lost |
| Products, accounts, order history | External Atlas | Retained | Retained, independently of Kind |
| Cities and ratings | PVC data-mysql-0 | Retained if the PVC survives | Lost without backup |
| Carts and anonymous counters | Redis, no persistence | Not guaranteed | Lost |
| Broker queues/messages | RabbitMQ emptyDir | Not guaranteed | Lost |

RabbitMQ emptyDir can survive a container restart within the same pod but not
pod replacement. Durable queue declarations do not make ephemeral storage durable.

Important files:

- infra/kind/kind-config.yaml: node topology, image pin, host ports 80/443.
- infra/kind/traefik-values.yaml: manually installed ingress-controller settings.
- k8s/overlays/kind/: application workloads, configuration, storage, ingress.
- k8s/argocd/kind/: Kind AppProject and Application bootstrap.
- scripts/kind/: helpers for hidden Secret input, image loading, and SQL backup.
- .github/workflows/container-images.yml: nine-image publishing workflow.

Do not apply the older k8s/argocd/application-dev.yaml or its parent kustomization:
it targets main/dev. Argo CD watches only k8s/overlays/kind. Committing controller
Helm values or Argo bootstrap files does not automatically install those resources.

## 3. Workstation and access prerequisites

Use Ubuntu/WSL with Docker Engine accessible without sudo. Plan for at least
4 CPUs, 8 GiB RAM (16 GiB preferred), and 30 GiB available disk. AMD64 was tested.
The image helper also handles homogeneous ARM64 Kind nodes; verify the remaining
component images and charts on that architecture.

Required tools: Git, curl, gzip, Python 3 for smoke checks, Docker, Kind v0.33.0,
kubectl, Helm, and AWS CLI v2. Use the official installation links at the end.
Docker needs image save --platform, available with API 1.48+. The validated Docker
version is 29.1.3.

**Use kubectl v1.33.x for this v1.33 cluster.** Supported kubectl skew is one minor
version. The current workstation was observed with client v1.37.0: commands have
worked, but this is not a supported recovery baseline. To install a compatible
v1.33.4 client, without changing the server:

~~~bash
(
  set -e
  case "$(uname -m)" in
    x86_64) client_arch=amd64 ;;
    aarch64|arm64) client_arch=arm64 ;;
    *) echo "Unsupported architecture"; exit 1 ;;
  esac
  client_tmp="$(mktemp -d)"
  cd "$client_tmp"
  curl -fLO "https://dl.k8s.io/release/v1.33.4/bin/linux/$client_arch/kubectl"
  curl -fLO "https://dl.k8s.io/release/v1.33.4/bin/linux/$client_arch/kubectl.sha256"
  printf '%s  kubectl\n' "$(cat kubectl.sha256)" | sha256sum --check
  sudo install -m 0755 kubectl /usr/local/bin/kubectl
)
kubectl version --client
~~~

The temporary download directory can be removed after a successful installation.

~~~bash
docker version
docker info
kind version
kubectl version --client
helm version --short
aws --version
git --version
df -h
~~~

AWS access uses your approved CLI login/profile. GitHub Actions uses its separate
OIDC role. Keep AWS keys, database credentials, backup encryption keys, and
password-manager recovery information outside Git.

~~~bash
aws sts get-caller-identity
aws ecr describe-repositories --region us-east-1 \
  --query 'repositories[].repositoryName' --output table
~~~

ECR needs these nine repositories under robotshop-kind/: catalogue, cart,
dispatch, payment, ratings, shipping, user, web, mysql. Pull access requires ECR
GetAuthorizationToken, BatchGetImage, and GetDownloadUrlForLayer; discovery needs
DescribeRepositories/DescribeImages.

### Get the correct checkout

For a new checkout:

~~~bash
git clone --branch codex/kind-test https://github.com/ariphmohd/robot-shop.git
cd robot-shop
~~~

For an existing checkout, inspect changes before pulling:

~~~bash
git status --short --branch
git branch --show-current
git pull --ff-only origin codex/kind-test
~~~

Do not reset or discard changes to solve an infrastructure issue. These new
recovery files must be committed and pushed before another person can clone them.

## 4. Reuse or create the cluster

Inspect first. Reuse a healthy named cluster rather than deleting it.

~~~bash
kind get clusters
docker ps
~~~

Only if robot-shop-test does not exist:

~~~bash
kind create cluster --config infra/kind/kind-config.yaml
~~~

Verify:

~~~bash
kubectl --context kind-robot-shop-test get nodes
kubectl --context kind-robot-shop-test get pods -A
kubectl --context kind-robot-shop-test get storageclass
docker port robot-shop-test-control-plane
~~~

Expect two Ready nodes, StorageClass standard with the local-path provisioner,
and host 80/443 mapped to the control-plane node. If those ports are occupied
before creating the cluster, investigate with ss -ltnp. Do not kill an unknown
listener. Moving these mappings requires a separately planned network change.

## 5. Atlas and the three manual Secrets

Atlas is external. **Do not reseed it because Kind was recreated.**

1. Find WSL's public egress IP using curl -4 https://checkip.amazonaws.com.
2. In Atlas Network Access, allow that address with /32.
3. Use robotshop_catalogue with readWrite on catalogue, and robotshop_user with
   readWrite on users, restricted to the intended Atlas cluster.
4. Obtain the existing valid connection strings from the approved password store.

URI formats below contain placeholders, not working credentials:

~~~text
mongodb+srv://robotshop_catalogue:ENCODED_PASSWORD@YOUR-CLUSTER.mongodb.net/catalogue?authSource=admin
mongodb+srv://robotshop_user:ENCODED_PASSWORD@YOUR-CLUSTER.mongodb.net/users?authSource=admin
~~~

Percent-encode special characters in URI passwords. The MariaDB root password is
a plain password, not a URI. An existing MariaDB PVC requires its current database
password; changing a Secret does not change a previously initialized database.

~~~bash
kubectl --context kind-robot-shop-test apply -f k8s/base/namespace.yaml
kubectl --context kind-robot-shop-test -n robot-shop get secrets
~~~

Create **only missing** Secrets. Run each helper interactively and paste its
value at the hidden prompt. No characters, dots, or cursor movement are shown.

~~~bash
bash scripts/kind/create-secret.sh catalogue-mongodb MONGO_URL
bash scripts/kind/create-secret.sh user-mongodb MONGO_URL
bash scripts/kind/create-secret.sh mysql-auth MYSQL_ROOT_PASSWORD
~~~

The helper rejects empty values and refuses to overwrite existing Secrets.
A new root password is appropriate only for a fresh empty MariaDB instance.

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop describe secret catalogue-mongodb
kubectl --context kind-robot-shop-test -n robot-shop describe secret user-mongodb
kubectl --context kind-robot-shop-test -n robot-shop describe secret mysql-auth
~~~

Descriptions show key names and byte counts. Do not export Secret YAML into Git.
Base64 is not encryption. Store credential recovery material outside this cluster.

### Only for a genuinely empty, new Atlas database

The validated catalogue has eleven products. Set the public hostname:

~~~bash
export ATLAS_HOST='YOUR-CLUSTER.mongodb.net'
docker run --rm -it mongo:8 \
  mongosh "mongodb+srv://$ATLAS_HOST/catalogue?authSource=admin&serverSelectionTimeoutMS=15000" \
  --username robotshop_catalogue \
  --eval 'db.products.countDocuments({})' --password
~~~

If count is eleven, skip import. If count is zero and you are **not restoring a
backup**, run the following once from the repository root:

~~~bash
docker run --rm -it \
  --mount "type=bind,source=$PWD/app/mongo,target=/seed,readonly" \
  mongo:8 \
  mongosh "mongodb+srv://$ATLAS_HOST/catalogue?authSource=admin" \
  --username robotshop_catalogue --file /seed/catalogue.js --password
~~~

Any other count, or an interrupted import, needs inspection before retrying.
Inserts can succeed before unique-index creation, so repeated imports can produce
duplicates. Do not import the demo users.js accounts.

Create the unique username index; an identical existing index is fine:

~~~bash
docker run --rm -it mongo:8 \
  mongosh "mongodb+srv://$ATLAS_HOST/users?authSource=admin" \
  --username robotshop_user \
  --eval 'db.users.createIndex({name: 1}, {unique: true})' --password
~~~

## 6. Load exact images from the current manifests

List requested ECR image references without pulling or modifying anything:

~~~bash
bash scripts/kind/load-images.sh --list
~~~

Then authenticate, pull, export the actual node architecture, and load all nine:

~~~bash
bash scripts/kind/load-images.sh
~~~

The helper reads the rendered overlay rather than assuming latest tags, verifies
node architecture, and stops on failure. By default it targets robot-shop-test
and us-east-1. It supports ROBOTSHOP_CLUSTER and AWS_REGION overrides.

Docker and Kind have separate image stores. The helper uses platform-specific
archives to avoid the containerd-store missing-digest issue. Host Docker login
does not authenticate Kubernetes nodes. Preloaded images with IfNotPresent do
not need an ECR pull Secret.

~~~bash
docker exec robot-shop-test-worker crictl images
~~~

Public Redis, RabbitMQ, and controller images still need internet access; this is
not an offline setup. If a referenced ECR image was deleted, stop, rebuild with
CI, and update manifests to the new successful tags before loading and syncing.
A rerun has a new run-attempt suffix. Keep immutable tags enabled.

## 7. Install controllers and bootstrap GitOps

Check existing installations first:

~~~bash
helm list --kube-context kind-robot-shop-test -A
kubectl --context kind-robot-shop-test -n argocd get pods
kubectl --context kind-robot-shop-test -n traefik get pods -o wide
~~~

If already healthy at the required versions, retain them. For a fresh cluster:

~~~bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo add traefik https://traefik.github.io/charts
helm repo update

helm upgrade --install argocd argo/argo-cd \
  --kube-context kind-robot-shop-test \
  --namespace argocd --create-namespace \
  --version 10.11.1 \
  --set server.service.type=ClusterIP \
  --wait --timeout 10m

helm upgrade --install traefik traefik/traefik \
  --kube-context kind-robot-shop-test \
  --namespace traefik --create-namespace \
  --version 42.1.3 \
  --values infra/kind/traefik-values.yaml \
  --wait --timeout 10m
~~~

Run each installation separately and continue only after success. A wait timeout
can leave an installed release: inspect pods/events before retrying or removing
anything.

If the Argo chart HTTP download times out before install, download separately.
The --timeout option controls resource waiting, not that HTTP download.

~~~bash
curl --fail --location --retry 3 --retry-delay 5 \
  --connect-timeout 30 --max-time 300 \
  --output /tmp/argo-cd-10.11.1.tgz \
  https://github.com/argoproj/argo-helm/releases/download/argo-cd-10.11.1/argo-cd-10.11.1.tgz

helm show chart /tmp/argo-cd-10.11.1.tgz
~~~

Only after successful download and matching chart/app versions:

~~~bash
helm upgrade --install argocd /tmp/argo-cd-10.11.1.tgz \
  --kube-context kind-robot-shop-test \
  --namespace argocd --create-namespace \
  --set server.service.type=ClusterIP \
  --wait --timeout 10m
~~~

Traefik runs on the control plane because Kind's 80/443 mappings terminate there.
Its node selector and toleration allow that placement. Applications run on worker
capacity. The ingress is HTTP only; mapped 443 does not supply a trusted TLS
certificate.

~~~bash
kubectl --context kind-robot-shop-test get ingressclass
kubectl --context kind-robot-shop-test apply -k k8s/argocd/kind
kubectl --context kind-robot-shop-test -n argocd get application robot-shop-kind
~~~

A public repository requires no Argo Git credentials for reads. For a private fork,
configure repository authentication outside Git and update repoURL, AppProject
sourceRepos, branch, and publisher trust consistently.

Retrieve the initial admin password privately, then start a UI port-forward:

~~~bash
kubectl --context kind-robot-shop-test -n argocd \
  get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d

kubectl --context kind-robot-shop-test -n argocd \
  port-forward svc/argocd-server 8085:443
~~~

Open https://localhost:8085, username admin. The self-signed local certificate
warning is expected. Keep the password private. If that initial Secret was
removed after a password change, use the recorded current login, not an assumed
default password. Use another local port if 8085 is occupied.

In robot-shop-kind:
1. Verify branch codex/kind-test, path k8s/overlays/kind, destination robot-shop.
2. Refresh and inspect Diff. A fresh cluster has missing desired resources;
   adoption requires reviewing existing resources before applying changes.
3. Manually Sync with **Prune, Force, and Replace unchecked**.
4. Wait for Synced / Healthy. MariaDB seed import can take several minutes;
   startup checks allow thirty minutes.

Do not sync before loading images and creating Secrets. Dispatch retries until
RabbitMQ starts; readiness waits for application dependencies. Do not delete a
PVC or restart MariaDB mid-import just because initialization is taking time.
Routine updates now go through Git/Argo rather than kubectl apply.

## 8. Acceptance checks

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop get pods,pvc,ingress
kubectl --context kind-robot-shop-test -n argocd get application robot-shop-kind

curl -fsS http://localhost/api/catalogue/health | python3 -m json.tool
curl -fsS http://localhost/api/catalogue/products |
  python3 -c 'import json,sys; print("Products:", len(json.load(sys.stdin)))'
curl -fsS http://localhost/api/user/health | python3 -m json.tool
curl -fsS http://localhost/api/cart/health | python3 -m json.tool
curl -fsS -w '\n' http://localhost/api/shipping/count
curl -fsS http://localhost/api/ratings/_health | python3 -m json.tool
~~~

Expect eleven ready pods, Bound data-mysql-0 (5 GiB), web Ingress class traefik,
Argo Synced / Healthy, eleven seeded products, mongo true, redis true,
pdo_connectivity true, and fresh city count 948833. Deliberately modified or
restored data may have different counts.

In Windows open http://localhost without a hosts entry or storefront port-forward.
If WSL curl works but the browser fails, check Windows port conflicts and WSL
localhost forwarding instead of exposing database ports.

Use a disposable test account/password to add an in-stock product, confirm
shipping, and complete demo checkout. No real payment details are required:
payment's dummy gateway check uses catalogue's local health endpoint.

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop \
  logs deployment/dispatch --tail=50
kubectl --context kind-robot-shop-test -n robot-shop \
  exec deployment/rabbitmq -- rabbitmqctl list_queues \
  name consumers messages_ready messages_unacknowledged
~~~

Match the checkout order ID in dispatch's Order log and the user's history array
in Atlas users.orders (Compass). There need not be a top-level document for each
order: histories are arrays grouped by user. Dispatch auto-acknowledges messages;
the demo does not provide transactional exactly-once checkout or broker replay.

Full web backend DNS names, such as catalogue.robot-shop.svc.cluster.local, are
essential for Nginx's async resolver. Short names previously caused 502 responses
even though direct catalogue requests worked.

## 9. Normal changes after recovery

Review the local diff, render the overlay, stage explicit files, inspect the
staged diff, commit/push, review Argo Diff, and manually Sync.

~~~bash
git status --short --branch
git diff
kubectl kustomize k8s/overlays/kind > /dev/null
git diff --check
# Stage only intended files, then:
git diff --cached
~~~

A new CI image does not deploy itself. Update image tags in Git, load those exact
images into Kind **before** starting the new pods, push and sync. Top-level
Deployment metadata changes do not restart pods; spec.template changes do.

Secret updates stay outside Git. Environment variables in running containers do
not refresh automatically. Rotate the actual database/service password and its
Secret in a coordinated way, then restart affected workloads. Never replace an
initialized database's root Secret with an arbitrary new password.

## 10. Backups before maintenance

### MariaDB

~~~bash
bash scripts/kind/backup-mysql.sh
~~~

This logically dumps cities and ratings with routines/events/triggers and a
consistent transaction for their InnoDB tables. Avoid schema changes during the
dump. It excludes the mysql system database, account grants, root password,
Kubernetes Secrets, and the underlying PVC.

Default output: $HOME/robot-shop-private/backups, outside Git. The helper uses
private permissions, pipefail, a partial file, gzip verification and a SHA256
checksum. Credentials are read inside mysql-0, not printed in host commands.

Copy the completed .sql.gz and .sha256 to protected, preferably encrypted,
off-host storage. **Gzip is not encryption.** A backup on the same WSL disk does
not cover host loss. Agree a backup interval and retention policy based on
acceptable rating-data loss.

A valid dump/checksum is not a restore test. Rehearse restoration in an isolated
environment before declaring backups tested. No recurring backup schedule is
created by this repository.

### Atlas

Kind loss does not delete Atlas, but Atlas deletion or bad writes require their
own recovery. Confirm backup facilities available on your Atlas tier; do not
assume hosted MongoDB automatically includes point-in-time recovery.

Install MongoDB Database Tools on a trusted workstation for logical exports.
Use a quiet period if application consistency is required: separate exports
are not an atomic snapshot across databases.

~~~bash
umask 077
export BACKUP_DIR="$HOME/robot-shop-private/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
export ATLAS_HOST='YOUR-CLUSTER.mongodb.net'
export BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mongodump \
  --uri="mongodb+srv://$ATLAS_HOST/catalogue?authSource=admin" \
  --username=robotshop_catalogue \
  --archive="$BACKUP_DIR/atlas-catalogue-$BACKUP_STAMP.archive.gz" \
  --gzip --password

mongodump \
  --uri="mongodb+srv://$ATLAS_HOST/users?authSource=admin" \
  --username=robotshop_user \
  --archive="$BACKUP_DIR/atlas-users-$BACKUP_STAMP.archive.gz" \
  --gzip --password
~~~

Enter passwords at prompts, not in commands. Record archive checksums, cluster
identity, UTC time, database names and tool versions privately. Protect account
and order exports and copy them encrypted off-host. Compass browsing is not a
backup.

### Other recovery material

Keep Secret values in an approved password manager. Keep image tags/digests
available; do not expire ECR images still referenced by recovery revisions.
Redis carts/counters and unprocessed RabbitMQ messages have no backup here.

Argo CD is reconstructed from Helm/bootstrap. Later UI-only changes to passwords,
users, RBAC, private Git credentials, and other settings require their own
protected record/backup. This runbook does not export Argo CD's secret data.

## 11. Restore data

### MariaDB logical restore

**Restoring replaces cities/ratings tables and data with the backup contents.**
Prefer an isolated recovery environment first. This is unnecessary for a healthy
PVC after an ordinary pod restart.

1. Complete sections 3–7; allow mysql-0 to initialize and become Ready.
2. Confirm the intended context and backup.
3. Stop application writes during restore. Auto-sync must remain disabled.
4. Validate the import before resuming users.

Choose the filename printed by the backup helper:

~~~bash
export BACKUP_FILE="$HOME/robot-shop-private/backups/REPLACE_WITH_BACKUP.sql.gz"
gzip -t "$BACKUP_FILE"
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$BACKUP_FILE").sha256"
)
~~~

Continue only if both checks pass and you intend to replace these data. Block
user traffic/stop active tests and temporarily stop shipping and ratings:

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop \
  scale deployment/shipping deployment/ratings --replicas=0
kubectl --context kind-robot-shop-test -n robot-shop \
  wait --for=delete pod -l app.kubernetes.io/name=shipping --timeout=120s
kubectl --context kind-robot-shop-test -n robot-shop \
  wait --for=delete pod -l app.kubernetes.io/name=ratings --timeout=120s
~~~

Do not sync during this temporary live replica change. Import without a TTY:

~~~bash
(
  set -o pipefail
  gzip -dc "$BACKUP_FILE" |
    kubectl --context kind-robot-shop-test -n robot-shop \
      exec -i mysql-0 -- /bin/sh -c \
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --binary-mode'
)
~~~

On failure leave writers stopped and diagnose; an SQL dump import is not
all-or-nothing. On success verify counts and a representative backed-up rating:

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop \
  exec mysql-0 -- /bin/sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --user=root --execute="SELECT COUNT(*) AS city_rows FROM cities.cities; SELECT COUNT(*) AS rating_rows FROM ratings.ratings;"'
~~~

Compare with the counts recorded at backup time. Resume the current Git-declared
replicas (one each):

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop \
  scale deployment/shipping deployment/ratings --replicas=1
kubectl --context kind-robot-shop-test -n robot-shop \
  rollout status deployment/shipping --timeout=300s
kubectl --context kind-robot-shop-test -n robot-shop \
  rollout status deployment/ratings --timeout=180s
~~~

Refresh Argo CD, review remaining differences, and rerun section 8. Keep the
original backup and record the restore results.

### Atlas

Do not restore over healthy Atlas just because Kind was recreated. Prefer an
empty replacement cluster, restore the individual database archives, verify
collections/indexes, then switch application credentials.

Example, for an **empty replacement** users database:

~~~bash
mongorestore \
  --uri="mongodb+srv://REPLACEMENT-HOST.mongodb.net/users?authSource=admin" \
  --username=robotshop_user \
  --archive="/absolute/private/path/atlas-users-BACKUP.archive.gz" \
  --gzip --stopOnError --password
~~~

Repeat with the catalogue archive and account. Do not combine a restored backup
with seed import. This deliberately omits --drop; do not add it against a live
database without a separately reviewed overwrite plan.

Recreate Atlas users/network access if that project was lost. After data
validation, update the Kubernetes connection-string Secrets outside Git and
restart catalogue/user so their environment variables pick up the replacement
URIs. Keep the old backup/cluster until acceptance is complete.

## 12. Partial recovery and troubleshooting

Start read-only:

~~~bash
kubectl --context kind-robot-shop-test -n robot-shop get pods,pvc,ingress
kubectl --context kind-robot-shop-test -n robot-shop get events --sort-by=.lastTimestamp
kubectl --context kind-robot-shop-test -n argocd get application robot-shop-kind
~~~

Inspect the specific pod with describe and logs. Redact sensitive output before
sharing: this demo can log account details and its AMQP demo URI.

| Symptom | Diagnosis/action |
|---|---|
| Cluster unavailable after WSL restart | Start Docker; inspect existing node containers before creating/deleting a cluster |
| Missing pod with correct Git | Review Argo Diff and manually sync; leave Force/Replace disabled |
| ImagePullBackOff | Verify exact tag in ECR and actual node cache; reload with image helper |
| Missing image digest on Kind load | Use platform-specific archives; avoid host-wide Docker storage changes |
| CreateContainerConfigError | Check Secret names and keys with describe; do not print decoded values |
| mysql-0 Pending | Describe PVC/pod; check standard provisioner and worker capacity |
| PVC Pending / WaitForFirstConsumer | Can be normal until a consuming pod is scheduled |
| First boot mysql Running 0/1 | Inspect import logs; allow startup time rather than deleting PVC |
| MariaDB access denied | Confirm Secret matches the initialized database; env changes do not reset DB passwords |
| MariaDB initialization interrupted | Inspect table/seed state; scripts may not replay after a data directory exists |
| Traefik 404 | Check localhost host rule, class traefik, entrypoint web, and Argo Ingress sync |
| Web 502 | Inspect web logs and full backend DNS names; test catalogue health directly |
| Windows browser fails but WSL curl works | Check Windows port conflicts and WSL localhost forwarding |
| Atlas timeout | Check current egress IP allowlist, Atlas availability, DNS and outbound network |
| Dispatch startup connection refused | Wait for broker, confirm Rabbit MQ ready true and queue consumer |
| Instana errors | No monitoring agent is installed; these alone do not imply application failure |
| Argo OutOfSync / Healthy | Inspect Diff and Git revision; distinguish intentional change from drift |
| Helm download timeout | Separate pinned archive download from install; inspect partial release before retry |
| Port-forward address in use | Select another local port; do not kill unknown listeners |

A replacement mysql-0 using the same PVC should keep its data and not reseed it.
Deleting the PVC/namespace is a different, destructive operation. The 5 GiB claim
in Git is not a backup.

If only Argo CD is lost, keep robot-shop and its PVC/Secrets. Reinstall Argo,
recreate bootstrap resources, inspect adoption diff, and sync without pruning.

Roll back a bad manifest using a reviewed Git revert, reload any previous image,
then manually sync. Git cannot roll back changed database data or migrations.
Do not use git reset --hard or remove storage as a rollback shortcut.

## 13. AWS publishing recovery after ECR/IAM deletion

This creates AWS resources and may incur normal charges. Skip when ECR and the
publisher role remain healthy. Check account 542697646590 and region us-east-1
before each provisioning step.

~~~bash
aws sts get-caller-identity
aws ecr describe-repositories --region us-east-1 \
  --query 'repositories[].repositoryName' --output table
~~~

Only if all nine repositories are missing:

~~~bash
(
  set -e
  for service in catalogue cart dispatch payment ratings shipping user web mysql; do
    aws ecr create-repository --region us-east-1 \
      --repository-name "robotshop-kind/$service" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256
  done
)
~~~

For partial loss, use the same creation command for confirmed missing names
only. The loop stops on an error and does not overwrite existing repositories.

Check OIDC:

~~~bash
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn \
  arn:aws:iam::542697646590:oidc-provider/token.actions.githubusercontent.com
~~~

Only for NoSuchEntity:

~~~bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
~~~

Verify the repository identity:

~~~bash
curl --fail --silent --show-error \
  https://api.github.com/repos/ariphmohd/robot-shop/actions/oidc/customization/sub
~~~

Expected immutable prefix: repo:ariphmohd@143442610/robot-shop@1420533083.
For a fork/recreated repository, review its actual subject instead of copying
this trust blindly. The original branch-based trust document is:

~~~bash
cat > /tmp/robotshop-kind-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::542697646590:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:ariphmohd@143442610/robot-shop@1420533083:ref:refs/heads/codex/kind-test"
      }
    }
  }]
}
EOF
~~~

Check the dedicated role before creating it:

~~~bash
aws iam get-role --role-name robotshop-kind-github-actions-ecr-push
~~~

Only for NoSuchEntity:

~~~bash
aws iam create-role \
  --role-name robotshop-kind-github-actions-ecr-push \
  --assume-role-policy-document file:///tmp/robotshop-kind-trust.json
~~~

Do not replace unrelated existing roles. For that dedicated role, restore its
reviewed account/region/prefix-scoped publishing policy:

~~~bash
cat > /tmp/robotshop-kind-ecr-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:us-east-1:542697646590:repository/robotshop-kind/*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name robotshop-kind-github-actions-ecr-push \
  --policy-name robotshop-kind-ecr-publish \
  --policy-document file:///tmp/robotshop-kind-ecr-policy.json
~~~

GitHub Settings → Secrets and variables → Actions → Variables must contain:

~~~text
Name: AWS_ECR_PUSH_ROLE_ARN
Value: arn:aws:iam::542697646590:role/robotshop-kind-github-actions-ecr-push
~~~

Do not add AWS access keys to Git. Jobs using a GitHub Environment have a
different subject shape and need a separately reviewed trust policy.

Run the publishing workflow on codex/kind-test. Manual workflow_dispatch must
also exist on the default branch for GitHub's Run workflow option. Otherwise an
approved change to app/** or the workflow pushed to codex/kind-test triggers its
push event.

Confirm all nine image jobs succeed. Tags follow
sha-<12-character-commit>-<run-id>-<run-attempt>. Update the nine Kind image
references to the new successful run, commit/push, load images, review Diff,
and sync. Recreating an ECR repository does not recover deleted image binaries.

## 14. Known limitations and verification scope

- Local test environment: no HA, HTTP storefront, public Atlas connectivity.
- Shipping, ratings, and RabbitMQ retain known demo credentials in code/config.
  Root and Atlas values stay outside Git. A secret manager alone would not
  remove application hardcoding.
- RabbitMQ guest inter-pod access exists for this demo; do not expose AMQP publicly.
- Redis and RabbitMQ tags float within version families. Record tested digests
  and pin them for stronger reproducibility.
- The chart pins record the tested baseline, not a guarantee of ongoing support.
  Review support/security before broader use.
- AppProject restrictions limit this application's allowed resources; they do
  not remove the controller's cluster permissions granted by its Helm chart.
- A single WSL-host loss destroys local cluster/storage. Keep protected copies
  outside that failure boundary.
- No automated backups, credential rotation, or destructive recovery rehearsal
  is established by this change. Syntax/render validation is not a restore test.

## References

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Kind quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)
- [Kind image-loading workaround](https://kind.sigs.k8s.io/docs/user/known-issues/#unable-to-kind-load-docker-images)
- [kubectl version skew](https://kubernetes.io/releases/version-skew-policy/#kubectl)
- [Install kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/)
- [Helm installation](https://helm.sh/docs/intro/install/)
- [AWS CLI installation](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Atlas connections](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)
- [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/)
- [MariaDB dump/restore](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump)
- [Argo CD resource tracking](https://argo-cd.readthedocs.io/en/stable/user-guide/resource_tracking/)
- [Argo Helm charts](https://github.com/argoproj/argo-helm)
- [Traefik Helm chart](https://github.com/traefik/traefik-helm-chart)
- [ECR push permissions](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push-iam.html)
- [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
