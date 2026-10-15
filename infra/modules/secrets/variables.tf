variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
}
