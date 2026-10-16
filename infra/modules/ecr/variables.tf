variable "project_name" {
  description = "Base project name used for ECR repository naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name used in ECR repository naming"
  type        = string
}

variable "aws_region" {
  description = "AWS Region containing the ECR registry and optional VPC endpoints"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the CI role, in OWNER/REPOSITORY form"
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must use the OWNER/REPOSITORY format."
  }
}

variable "github_branch" {
  description = "Git branch allowed to publish images"
  type        = string
}

variable "github_oidc_subject" {
  description = "Exact GitHub Actions OIDC sub claim allowed to publish images"
  type        = string

  validation {
    condition     = startswith(var.github_oidc_subject, "repo:")
    error_message = "github_oidc_subject must be a GitHub Actions subject claim beginning with repo:."
  }
}

variable "image_retention_count" {
  description = "Maximum number of images retained in each repository"
  type        = number
  default     = 30

  validation {
    condition     = var.image_retention_count >= 1
    error_message = "image_retention_count must be at least 1."
  }
}

variable "enable_vpc_endpoints" {
  description = "Whether to create private ECR and S3 endpoints for image pulls from EKS"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "VPC ID in which optional interface endpoints are created; required only when enable_vpc_endpoints is true"
  type        = string
  default     = null
  nullable    = true
}

variable "private_app_subnet_ids" {
  description = "Private application subnet IDs for optional ECR interface endpoints"
  type        = list(string)
  default     = []
}

variable "private_app_route_table_ids" {
  description = "Private application route table IDs for the optional S3 gateway endpoint"
  type        = list(string)
  default     = []
}

variable "eks_nodes_security_group_id" {
  description = "Security group attached to EKS worker nodes and allowed to reach optional endpoints; required only when enable_vpc_endpoints is true"
  type        = string
  default     = null
  nullable    = true
}
