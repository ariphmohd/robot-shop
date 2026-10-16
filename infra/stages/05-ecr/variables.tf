variable "aws_region" {
  description = "AWS Region where ECR repositories and optional VPC endpoints are created"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
  default     = "robotshop"
}

variable "github_repository" {
  description = "GitHub repository allowed to push images, in OWNER/REPOSITORY form"
  type        = string
  default     = "ariphmohd/robot-shop"
}

variable "github_branch" {
  description = "Git branch allowed to push images"
  type        = string
  default     = "main"
}

variable "enable_ecr_vpc_endpoints" {
  description = "Create private ECR and S3 image-pull endpoints in the VPC"
  type        = bool
  default     = false
}

variable "ecr_image_retention_count" {
  description = "Maximum number of images retained in each ECR repository"
  type        = number
  default     = 30
}

# Shared inputs allow this stage to use the existing dev.tfvars and prod.tfvars files.
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  type    = bool
  default = true
}

variable "kubernetes_version" {
  type    = string
  default = "1.36"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.micro"]
}

variable "enable_docdb" {
  type    = bool
  default = false
}

variable "enable_ebs_csi" {
  type    = bool
  default = false
}

variable "enable_nat_gateway" {
  type    = bool
  default = true
}
