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
