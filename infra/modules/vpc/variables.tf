variable "vpc_cidr" {
  description = "Base IPv4 CIDR block for the VPC"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
}

variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster for subnet discovery tagging"
  type        = string
}

variable "single_nat_gateway" {
  description = "True to create 1 shared NAT Gateway (dev), false for 1 per AZ (prod)"
  type        = bool
  default     = true
}

variable "enable_nat_gateway" {
  description = "Whether to provision NAT Gateways. Set to false in dev to save ~$35/month."
  type        = bool
  default     = true
}

