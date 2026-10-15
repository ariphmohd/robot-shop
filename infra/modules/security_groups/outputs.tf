output "alb_security_group_id" {
  description = "Security Group ID for the Application Load Balancer"
  value       = aws_security_group.alb.id
}

output "eks_nodes_security_group_id" {
  description = "Security Group ID for the EKS Worker Nodes and Pods"
  value       = aws_security_group.eks_nodes.id
}

output "database_security_group_id" {
  description = "Security Group ID for the Tier 3 Databases (RDS, DocDB, ElastiCache, MQ)"
  value       = aws_security_group.database.id
}
