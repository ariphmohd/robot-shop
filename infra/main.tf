locals {
  cluster_name = "${var.project_name}-${var.environment}-eks"
}

# =============================================================================
# Stage 1: VPC & 3-Tier Subnets Networking Module
# =============================================================================
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  cluster_name       = local.cluster_name
  single_nat_gateway = var.single_nat_gateway
  enable_nat_gateway = var.enable_nat_gateway
}

# =============================================================================
# Stage 2: Security Groups (Least-Privilege Network Firewalls)
# =============================================================================
module "security_groups" {
  source = "./modules/security_groups"

  vpc_id       = module.vpc.vpc_id
  project_name = var.project_name
  environment  = var.environment
}

# =============================================================================
# Stage 3: AWS Secrets Manager (Credentials Management)
# =============================================================================
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment
}

# =============================================================================
# Stage 4: AWS Managed Databases (RDS, DocumentDB, ElastiCache, Amazon MQ)
# =============================================================================
module "databases" {
  source = "./modules/databases"

  project_name                  = var.project_name
  environment                   = var.environment
  rds_subnet_group_name         = module.vpc.rds_subnet_group_name
  docdb_subnet_group_name       = module.vpc.docdb_subnet_group_name
  elasticache_subnet_group_name = module.vpc.elasticache_subnet_group_name
  isolated_db_subnet_ids        = module.vpc.isolated_db_subnet_ids
  database_security_group_id    = module.security_groups.database_security_group_id

  mysql_username = module.secrets.mysql_username
  mysql_password = module.secrets.mysql_password
  docdb_username = module.secrets.docdb_username
  docdb_password = module.secrets.docdb_password
  mq_username    = module.secrets.mq_username
  mq_password    = module.secrets.mq_password
  enable_docdb   = var.enable_docdb
}


# =============================================================================
# Stage 5: Amazon EKS Cluster & Managed Worker Node Group
# =============================================================================
module "eks" {
  source = "./modules/eks"

  project_name                = var.project_name
  environment                 = var.environment
  cluster_name                = local.cluster_name
  kubernetes_version          = var.kubernetes_version
  node_instance_types         = var.node_instance_types
  enable_ebs_csi              = var.enable_ebs_csi
  enable_nat_gateway          = var.enable_nat_gateway
  vpc_id                      = module.vpc.vpc_id
  public_subnet_ids           = module.vpc.public_subnet_ids
  private_app_subnet_ids      = module.vpc.private_app_subnet_ids
  eks_nodes_security_group_id = module.security_groups.eks_nodes_security_group_id
  secrets_manager_arn         = module.secrets.secret_arn
}


