# Robot Shop — AWS 3-Tier Microservices Architecture (`app/` + `infra/`)

A complete polyglot microservices e-commerce application (`app/`) paired with an enterprise-grade, strict 3-Tier AWS cloud infrastructure (`infra/`) provisioned via Terraform / OpenTofu.

---

## 📁 Monorepo Structure

```text
EKS-Three-Tier/
├── app/                            # Polyglot Microservices Application & Dockerfiles
│   ├── web/                        # Storefront UI (Nginx + AngularJS)
│   ├── catalogue/                  # Product Catalogue Service (Node.js + MongoDB)
│   ├── user/                       # User Authentication Service (Node.js + MongoDB + Redis)
│   ├── cart/                       # Shopping Cart Service (Node.js + Redis)
│   ├── shipping/                   # Shipping & Tax Calculator (Java Spring Boot + MySQL)
│   ├── payment/                    # Payment Gateway Processor (Python + RabbitMQ)
│   ├── ratings/                    # Product Ratings API (PHP + MySQL)
│   ├── dispatch/                   # Order Dispatch Consumer (Go + RabbitMQ)
│   ├── mysql/                      # Database Schema & Seed Data
│   ├── mongo/                      # Catalogue & User Seed Scripts
│   └── docker-compose.yaml         # Local multi-container developer environment
│
├── infra/                          # AWS 3-Tier Cloud Infrastructure (Terraform)
│   ├── environments/
│   │   ├── dev.tfvars              # Free-Tier compliant Dev environment config
│   │   └── prod.tfvars             # Multi-AZ HA Production environment config
│   ├── modules/                    # Reusable Terraform Modules
│   │   ├── vpc/                    # Tier 1 Public, Tier 2 Private App, Tier 3 Air-Gapped DB Subnets
│   │   ├── security_groups/        # Chained least-privilege security groups
│   │   ├── secrets/                # AWS Secrets Manager & cryptographic password generation
│   │   ├── databases/              # Amazon RDS MySQL, ElastiCache Redis, Amazon MQ, DocumentDB
│   │   └── eks/                    # Amazon EKS v1.36, Worker Nodes, OIDC, IRSA, Add-ons
│   ├── stages/                     # Decoupled Step-by-Step Execution Layers (Isolated State)
│   │   ├── 01-vpc/
│   │   ├── 02-security-groups/
│   │   ├── 03-secrets/
│   │   ├── 04-databases/
│   │   └── 05-eks/
│   ├── main.tf                     # Root "Run All at Once" orchestrator
│   └── README.md                   # Detailed Infrastructure & Deployment Guide
│
├── .gitignore                      # Global exclusions for Terraform state, secrets, and build artifacts
└── README.md                       # Root project overview
```

---

## 🚀 Getting Started

### 1. Local Application Testing (`app/`)
See [`app/README.md`](./app/README.md) to build and run the microservices locally with Docker Compose:
```bash
cd app
docker compose up --build
```

### 2. Cloud Infrastructure Provisioning (`infra/`)
See [`infra/README.md`](./infra/README.md) for full instructions on deploying the AWS 3-tier infrastructure either **stage-by-stage** (`infra/stages/01-vpc` through `05-eks`) or **all-at-once** (`infra/main.tf`).
