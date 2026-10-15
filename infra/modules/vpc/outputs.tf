output "vpc_id" {
  description = "The ID of the created VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of IDs for Tier 1 Public Subnets (ALB & NAT)"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "List of IDs for Tier 2 Private App Subnets (EKS Worker Nodes)"
  value       = aws_subnet.private_app[*].id
}

output "isolated_db_subnet_ids" {
  description = "List of IDs for Tier 3 Isolated Database Subnets (RDS, DocDB, Redis)"
  value       = aws_subnet.isolated_db[*].id
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = var.enable_nat_gateway ? aws_nat_gateway.main[*].id : []
}


output "rds_subnet_group_name" {
  description = "Name of the RDS DB Subnet Group"
  value       = aws_db_subnet_group.rds.name
}

output "docdb_subnet_group_name" {
  description = "Name of the DocumentDB Cluster Subnet Group"
  value       = aws_docdb_subnet_group.docdb.name
}

output "elasticache_subnet_group_name" {
  description = "Name of the ElastiCache Redis Subnet Group"
  value       = aws_elasticache_subnet_group.elasticache.name
}
