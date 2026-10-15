variable "vpc_id" {
  description = "The ID of the VPC where security groups will be created"
  type        = string
}

variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
}
