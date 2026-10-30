# Robot Shop application

Application source and image-building CI for the local Robot Shop environment.
Infrastructure, Kubernetes manifests, operational scripts and project documentation
live in [robot-shop-infra](https://github.com/ariphmohd/robot-shop-infra).

## Repository layout

```text
robot-shop/
├── app/
│   ├── catalogue/ cart/ user/ web/
│   ├── shipping/ ratings/ payment/ dispatch/
│   ├── mysql/ mongo/
│   ├── ci/plan-images.py
│   ├── ci/tests/test_image_planning.py
│   ├── dev/preview-storefront.py
│   ├── docker-compose.yaml
│   └── LICENSE
├── .github/workflows/container-images.yml
├── .gitignore
└── README.md
```

Service directories contain their source, Dockerfile and service-specific tests.
`app/ci` contains the build planner and its checks; `app/dev` contains local
source-preview tooling. `.gitignore` protects local credentials and build output.
Database seed scripts remain with application source. Running them against an
existing database is not part of normal CI/CD.

## Development and release

- Feature branch: `features`.
- Release branch: `codex/kind-test`.
- Deployment manifests: `robot-shop-infra/main:k8s/overlays/kind`.

Review feature changes through a PR into the release branch. PRs run tests and
build selected images without publishing to ECR or writing infrastructure Git.
On a release run, CI builds affected services and pushes immutable ECR image tags.
If `KIND_CD_ENABLED=true`, it then commits those tags to the separate infra repo.
Argo CD reconciles that repo according to its active sync policy, and Kind nodes
pull the new images using the existing ECR pull Secret.

The planner reads desired tags from the separate infra checkout and carries
forward application changes whose earlier builds never published manifests.
Changes to CI/shared app configuration select all services. Preview-only changes
under `app/dev/` do not trigger the image workflow. A green publishing job does
not prove that the local cluster rollout has finished.

During the repository handover, keep `KIND_CD_ENABLED=false` until the release
workflow and first infra commit have been reviewed. See the
[CI/CD handover guide](https://github.com/ariphmohd/robot-shop-infra/blob/main/docs/kind-ci-cd.md)
for the separate activation steps. This layout cleanup does not enable CD.

## Local checks

Run from `/home/mohd/projects/robot-shop`:

```bash
python3 -B -m unittest discover -s app/ci/tests -p test_image_planning.py -v
node --test app/web/tests/*.test.cjs
```

Payment checks require a Python environment with
`app/payment/tests/requirements.txt` installed:

```bash
python3 -B -m unittest discover -s app/payment/tests -v
```

Infrastructure helper tests run from the other checkout:

```bash
cd /home/mohd/projects/robot-shop-infra
python3 -B -m unittest discover -s tests -p test_kind_infra.py -v
```

## Source preview

With the Kind storefront available at `http://localhost/`:

```bash
cd /home/mohd/projects/robot-shop
python3 app/dev/preview-storefront.py
```

Open `http://localhost:18090/`. This is a temporary source preview; it reads
catalogue/shipping information from Kind and uses isolated in-memory carts and
demo orders. It does not deploy a container or save preview orders in Atlas.
Restart the preview process after WSL restarts. The deployed app remains at
`http://localhost/`.

## Documentation

- [Infrastructure and operations](https://github.com/ariphmohd/robot-shop-infra)
- [Repository ownership](https://github.com/ariphmohd/robot-shop-infra/blob/main/docs/repository-layout.md)
- [Recreation and recovery](https://github.com/ariphmohd/robot-shop-infra/blob/main/docs/kind-recovery.md)
- [Region and currency display](https://github.com/ariphmohd/robot-shop-infra/blob/main/docs/region-currency.md)
- [Delivery and demo checkout](https://github.com/ariphmohd/robot-shop-infra/blob/main/docs/checkout-delivery.md)

The application remains a local demo; feature changes do not establish production
security or real payment/fulfilment capabilities. Keep credentials outside Git.
Licensed under [Apache License 2.0](app/LICENSE).
