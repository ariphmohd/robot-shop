# AWS 3-Tier Microservices Infrastructure (`infra/`)

Production-grade, modular AWS infrastructure provisioning for the **Robot Shop 3-Tier Microservices Application** using 100% Terraform / OpenTofu.

Supports **two execution modes**:
1. **Decoupled Stage-by-Stage Mode (`stages/01-vpc` → `05-eks`)**: Provision, inspect, and verify each infrastructure layer independently with isolated state files and zero blast radius.
2. **Unified All-at-Once Mode (Root `main.tf`)**: Provision the entire stack in a single command once all stages are verified.

---

## 🏛️ Architecture Overview

The infrastructure strictly adheres to the **AWS Well-Architected Framework** with network segmentation across 3 Availability Zones and zero direct database exposure:

```mermaid
graph TD
    Internet([Public Internet]) -->|HTTP :80 / HTTPS :443| Tier1["Tier 1: Public Subnets (10.0.1.0/24 - 10.0.3.0/24)<br/>• Internet Gateway<br/>• NAT Gateway(s)<br/>• ALB Security Group (alb_sg)"]

    Tier1 -->|NodePort / TargetGroup ingress only| Tier2["Tier 2: Private App Subnets (10.0.10.0/24 - 10.0.12.0/24)<br/>• Amazon EKS v1.36 Managed Node Group<br/>• IAM OIDC Provider & IRSA Roles<br/>• Core EKS Addons (VPC-CNI w/ Prefix Delegation, CoreDNS, Kube-Proxy)<br/>• Node Security Group (eks_nodes_sg)"]

    Tier2 -->|Chained ingress strictly from eks_nodes_sg| Tier3["Tier 3: Air-Gapped Isolated DB Subnets (10.0.20.0/24 - 10.0.22.0/24)<br/>• NO route to Internet Gateway or NAT<br/>• Database Security Group (database_sg)"]

    subgraph AWS Managed PaaS Data Stores
        Tier3 --> RDS["Amazon RDS MySQL<br/>Port 3306 (Shipping & Ratings)"]
        Tier3 --> DocDB["Amazon DocumentDB / In-Cluster Mongo<br/>Port 27017 (Catalogue & Users)"]
        Tier3 --> Redis["Amazon ElastiCache Redis<br/>Port 6379 (Cart & Sessions)"]
        Tier3 --> MQ["Amazon MQ RabbitMQ<br/>Port 5671/5672 (Orders & Dispatch)"]
    end

    SM["AWS Secrets Manager<br/>(Cryptographic Passwords)"] -.->|Auto-injected| Tier3
    SM -.->|IRSA Policy| Tier2
```

---

## 📁 Repository & Directory Layout

```text
EKS-Three-Tier/
├── app/                            # Microservices source code & Dockerfiles
│   ├── web/                        # Storefront UI (Nginx)
│   ├── catalogue/                  # Node.js
│   ├── user/                       # Node.js
│   ├── cart/                       # Node.js
│   ├── shipping/                   # Java Spring Boot
│   ├── payment/                    # Python
│   ├── ratings/                    # PHP
│   ├── dispatch/                   # Go
│   └── mysql/                      # Database schema scripts
│
└── infra/                          # Cloud Infrastructure (Terraform)
    ├── README.md                   # This documentation
    ├── main.tf                     # Root "Run All at Once" orchestrator
    ├── variables.tf                # Global input variables
    ├── outputs.tf                  # Root exports
    ├── providers.tf                # AWS provider configuration
    ├── versions.tf                 # Terraform & provider version constraints
    │
    ├── environments/               # Environment-specific variable definitions
    │   ├── dev.tfvars              # Free-Tier compliant (t3.micro, Single NAT, in-cluster Mongo)
    │   └── prod.tfvars             # Multi-AZ HA production (3 NATs, m6i.large, Multi-AZ RDS/DocDB)
    │
    ├── modules/                    # Reusable Core Modules
    │   ├── vpc/                    # 3-Tier Multi-AZ VPC, 9 Subnets, IGW, NAT, Subnet Groups
    │   ├── security_groups/        # Chained least-privilege firewalls (alb_sg -> eks_sg -> db_sg)
    │   ├── secrets/                # AWS Secrets Manager & compliant random_password generation
    │   ├── databases/              # RDS MySQL, ElastiCache Redis, Amazon MQ, DocumentDB
    │   └── eks/                    # EKS v1.36 Control Plane, Node Group, OIDC, IRSA, Add-ons
    │
    └── stages/                     # Decoupled Step-by-Step Execution Folders (Isolated States)
        ├── 01-vpc/                 # Step 1: Provision & verify VPC & 9 subnets
        ├── 02-security-groups/     # Step 2: Provision & verify ALB, Node, and DB security groups
        ├── 03-secrets/             # Step 3: Provision & verify AWS Secrets Manager vault
        ├── 04-databases/           # Step 4: Provision & verify RDS, Redis, and RabbitMQ
        └── 05-eks/                 # Step 5: Provision & verify EKS v1.36 & Worker Nodes
```

---

## 🚀 Mode 1: Decoupled Step-by-Step Execution (Recommended for Learning & Verification)

Each stage in `stages/` has its own isolated `terraform.tfstate` and automatically reads required IDs from previous stages via `terraform_remote_state`.

### Stage 1: VPC & 3-Tier Subnets
```bash
cd infra/stages/01-vpc
terraform init
terraform apply -var-file=../../environments/dev.tfvars
```

### Stage 2: Security Groups
```bash
cd ../02-security-groups
terraform init
terraform apply -var-file=../../environments/dev.tfvars
```

### Stage 3: AWS Secrets Manager
```bash
cd ../03-secrets
terraform init
terraform apply -var-file=../../environments/dev.tfvars
```

### Stage 4: Managed Databases (All at once OR one database at a time)
```bash
cd ../04-databases
terraform init

# Option A: Create all Dev databases (RDS + Redis + MQ)
terraform apply -var-file=../../environments/dev.tfvars

# Option B: Create ONLY RDS MySQL first, then Redis, then MQ one-by-one:
terraform apply -var-file=../../environments/dev.tfvars -var="enable_redis=false" -var="enable_mq=false"
terraform apply -var-file=../../environments/dev.tfvars -var="enable_mq=false"
terraform apply -var-file=../../environments/dev.tfvars
```

### Stage 5: Amazon EKS Cluster & Worker Nodes
```bash
cd ../05-eks
terraform init
terraform apply -var-file=../../environments/dev.tfvars

# Configure kubectl and verify nodes
aws eks update-kubeconfig --name robotshop-dev-eks --region us-east-1
kubectl get nodes
kubectl get pods -n kube-system
```

---

## ⚡ Mode 2: Unified "Run All at Once" Execution

Once you have verified each individual stage and want to provision the entire infrastructure in a single run from the `infra/` root:

```bash
cd infra
terraform init
terraform validate
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

---

## ⚙️ Environments Comparison (`dev.tfvars` vs `prod.tfvars`)

| Configuration | Development (`dev.tfvars`) | Production (`prod.tfvars`) | Rationale / Benefits |
|---|---|---|---|
| **Kubernetes Version** | `1.36` | `1.36` | Latest active AWS EKS Standard Support version. |
| **NAT Gateways** | `1` (`single_nat_gateway = true`) | `3` (1 per AZ) | Saves ~$65/mo in dev while ensuring full multi-AZ HA in prod. |
| **RDS MySQL** | Single-AZ `db.t3.micro` (Free Tier) | Multi-AZ `db.m6i.large` | Free-tier compliant in dev; zero-downtime failover in prod. |
| **DocumentDB** | Disabled (`enable_docdb = false`) | 3-instance `db.r6g.large` cluster | Uses in-cluster MongoDB in dev (avoids Free Plan account block). |
| **ElastiCache Redis** | Single-node `cache.t3.micro` (Free Tier) | Multi-AZ `cache.m6g.large` | Free-tier compliant in dev; HA auto-failover in prod. |
| **Amazon MQ (RabbitMQ)** | Single-instance `mq.m7g.large` (v4.2) | Multi-AZ `mq.m7g.large` (v4.2) | Modern Graviton instance with compliant password generator. |
| **EKS Worker Nodes** | 2 × `t3.micro` (Free Tier, 20GB disk) | 3 × `["m6i.large", "m7i.large"]` | Prefix Delegation enabled on VPC-CNI to allow up to 110 pods per `t3.micro`. |
| **EBS CSI Add-on** | Disabled (`enable_ebs_csi = false`) | Enabled (`enable_ebs_csi = true`) | Stateless microservices with external PaaS DBs need zero PVCs in dev. |
