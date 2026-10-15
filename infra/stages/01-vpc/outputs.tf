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

output "rds_subnet_group_name" {
  description = "DB Subnet Group name for Amazon RDS"
  value       = module.vpc.rds_subnet_group_name
}

output "docdb_subnet_group_name" {
  description = "Subnet Group name for Amazon DocumentDB"
  value       = module.vpc.docdb_subnet_group_name
}

output "elasticache_subnet_group_name" {
  description = "Subnet Group name for Amazon ElastiCache Redis"
  value       = module.vpc.elasticache_subnet_group_name
}
