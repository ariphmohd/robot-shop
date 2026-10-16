output "ecr_repository_urls" {
  description = "Map of deployable service names to their ECR repository URLs"
  value       = module.ecr.repository_urls
}

output "github_actions_ecr_push_role_arn" {
  description = "IAM role ARN to configure as the AWS_ECR_PUSH_ROLE_ARN GitHub repository variable"
  value       = module.ecr.github_actions_ecr_push_role_arn
}

output "ecr_vpc_endpoint_ids" {
  description = "IDs of optional private ECR and S3 endpoints"
  value       = module.ecr.vpc_endpoint_ids
}
