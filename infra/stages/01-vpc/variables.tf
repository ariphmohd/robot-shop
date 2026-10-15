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

variable "vpc_cidr" {
  description = "Base IPv4 CIDR block for the 3-tier VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  description = "When true, provisions 1 shared NAT Gateway (cost-saving for dev). When false, provisions 1 per AZ (high availability for prod)."
  type        = bool
  default     = true
}

# Shared environment variables accepted so dev.tfvars / prod.tfvars can be passed directly
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

variable "enable_docdb" {
  description = "Enable Amazon DocumentDB cluster"
  type        = bool
  default     = false
}

variable "enable_ebs_csi" {
  description = "Enable AWS EBS CSI Driver addon"
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "Whether to provision NAT Gateway"
  type        = bool
  default     = true
}

