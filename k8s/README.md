# Kubernetes GitOps manifests

Argo CD watches `k8s/overlays/dev` on the `main` branch and deploys it to the
`robot-shop` namespace in the development EKS cluster.

## Bootstrap order

1. Install Argo CD with Helm into the `argocd` namespace.
2. Apply `k8s/argocd` to create the `AppProject` and `Application` objects.
3. In the Argo CD UI, review and manually sync `robot-shop-dev`.
4. Add application workloads to `base` and environment-specific configuration
   to `overlays/dev`.

Automated sync, pruning, and self-healing are intentionally not enabled during
initial setup. They will be enabled after a reviewed successful deployment.

Do not add secret values to this directory. Runtime secrets will be sourced
from AWS Secrets Manager in a later step.
