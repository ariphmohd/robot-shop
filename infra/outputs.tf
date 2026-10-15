# =============================================================================
# Stage 1: Networking Outputs
# =============================================================================
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Tier 1 Public Subnets (ALB & NAT Gateway)"
  value       = module.vpc.public_subnet_ids
}

output "private_app_subnet_ids" {
  description = "Tier 2 Private App Subnets (EKS Worker Nodes & Pods)"
  value       = module.vpc.private_app_subnet_ids
}

output "isolated_db_subnet_ids" {
  description = "Tier 3 Isolated Database Subnets (RDS, DocumentDB, ElastiCache)"
  value       = module.vpc.isolated_db_subnet_ids
}

output "nat_gateway_ids" {
  description = "IDs of the deployed NAT Gateways"
  value       = module.vpc.nat_gateway_ids
}

# =============================================================================
# Stage 2: Security Group Outputs
# =============================================================================
output "alb_security_group_id" {
  description = "Security Group ID for the Application Load Balancer"
  value       = module.security_groups.alb_security_group_id
}

output "eks_nodes_security_group_id" {
  description = "Security Group ID for the EKS Worker Nodes and Pods"
  value       = module.security_groups.eks_nodes_security_group_id
}

output "database_security_group_id" {
  description = "Security Group ID for the Tier 3 Databases (RDS, DocDB, ElastiCache, MQ)"
  value       = module.security_groups.database_security_group_id
}

# =============================================================================
# Stage 3: AWS Secrets Manager Outputs
# =============================================================================
output "secrets_manager_arn" {
  description = "ARN of the AWS Secrets Manager vault storing DB passwords"
  value       = module.secrets.secret_arn
}

output "secrets_manager_name" {
  description = "Name of the AWS Secrets Manager vault"
  value       = module.secrets.secret_name
}

# =============================================================================
# Stage 4: AWS Managed Database Endpoints
# =============================================================================
output "rds_mysql_endpoint" {
  description = "Endpoint address for Amazon RDS MySQL"
  value       = module.databases.mysql_endpoint
}

output "docdb_endpoint" {
  description = "Cluster endpoint address for Amazon DocumentDB"
  value       = module.databases.docdb_endpoint
}

output "redis_endpoint" {
  description = "Primary endpoint address for Amazon ElastiCache Redis"
  value       = module.databases.redis_endpoint
}

output "rabbitmq_endpoint" {
  description = "AMQP endpoint address for Amazon MQ RabbitMQ"
  value       = module.databases.mq_endpoint
}

# =============================================================================
# Stage 5: Amazon EKS Cluster Outputs
# =============================================================================
output "eks_cluster_name" {
  description = "The name of the Amazon EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "The Kubernetes API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_oidc_provider_arn" {
  description = "ARN of the IAM OIDC Provider for IRSA"
  value       = module.eks.oidc_provider_arn
}

output "eks_ebs_csi_role_arn" {
  description = "ARN of the IAM role for the Amazon EBS CSI Driver (IRSA)"
  value       = module.eks.ebs_csi_role_arn
}


