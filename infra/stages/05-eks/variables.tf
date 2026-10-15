variable "aws_region" {
  description = "The AWS Region where all resources will be created"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Base project name used for resource naming and tagging"
  type        = string
  default     = "robotshop"
}

variable "kubernetes_version" {
  description = "Desired Kubernetes version for Amazon EKS"
  type        = string
  default     = "1.36"
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS managed node group"
  type        = list(string)
  default     = ["t3.micro"]
}

variable "enable_ebs_csi" {
  description = "Enable AWS EBS CSI Driver addon"
  type        = bool
  default     = false
}

# Shared environment variables accepted so dev.tfvars / prod.tfvars can be passed directly
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  type    = bool
  default = true
}

variable "enable_docdb" {
  type    = bool
  default = false
}

variable "enable_nat_gateway" {
  description = "Whether NAT Gateway is enabled"
  type        = bool
  default     = true
}

