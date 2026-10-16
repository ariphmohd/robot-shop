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

output "alb_controller_role_arn" {
  description = "ARN of the IAM role for the AWS Load Balancer Controller"
  value       = module.eks.alb_controller_role_arn
}

output "secrets_csi_role_arn" {
  description = "ARN of the IAM role for the Secrets Store CSI Driver"
  value       = module.eks.secrets_csi_role_arn
}

output "eks_ebs_csi_role_arn" {
  description = "ARN of the IAM role for the Amazon EBS CSI Driver (IRSA)"
  value       = module.eks.ebs_csi_role_arn
}
