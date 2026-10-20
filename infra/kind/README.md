# Local Kind environment

This directory contains the local-only Kubernetes configuration used by the
`codex/kind-test` branch. It is intended for an Ubuntu virtual machine running
in UTM on a Mac. It does not provision or modify AWS infrastructure.

## Purpose

The Kind cluster validates Kubernetes manifests, Argo CD GitOps behaviour,
service discovery, health checks, and MongoDB Atlas connectivity before the
same application is promoted to an EKS-based UAT environment.

AWS-specific behaviour such as the AWS Load Balancer Controller, EKS Pod
Identity, node IAM authentication to ECR, and VPC security groups must be
validated in UAT EKS.

## Prerequisites

- Ubuntu VM with Docker Engine available to the current user.
- `kubectl`, `kind`, and Helm installed.
- Recommended VM allocation: 4 vCPUs, 8 GiB RAM, and 30 GiB free disk.
- Ensure ports 80 and 443 are free in the Ubuntu VM before cluster creation.

## Create the cluster

```bash
kind create cluster --config infra/kind/kind-config.yaml
kubectl cluster-info --context kind-robot-shop-test
kubectl get nodes
```

The configuration creates one control-plane node and one worker. It maps the
Ubuntu VM's ports 80 and 443 into the Kind control-plane node for local Ingress
testing. The control-plane node is labelled `ingress-ready=true` for the local
ingress controller that will be installed in a later step.

## Delete the cluster

```bash
kind delete cluster --name robot-shop-test
```
