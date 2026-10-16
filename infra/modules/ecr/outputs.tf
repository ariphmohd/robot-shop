output "repository_urls" {
  description = "Map of deployable service names to their ECR repository URLs"
  value       = { for service, repository in aws_ecr_repository.service : service => repository.repository_url }
}

output "repository_arns" {
  description = "Map of deployable service names to their ECR repository ARNs"
  value       = { for service, repository in aws_ecr_repository.service : service => repository.arn }
}

output "github_actions_ecr_push_role_arn" {
  description = "IAM role ARN assumed by the GitHub Actions image-publishing workflow"
  value       = aws_iam_role.github_actions_ecr_push.arn
}

output "vpc_endpoint_ids" {
  description = "IDs for optional ECR API, ECR Docker, and S3 VPC endpoints"
  value = {
    ecr_api = try(aws_vpc_endpoint.ecr_api[0].id, null)
    ecr_dkr = try(aws_vpc_endpoint.ecr_dkr[0].id, null)
    s3      = try(aws_vpc_endpoint.s3[0].id, null)
  }
}
