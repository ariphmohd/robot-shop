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

variable "kubernetes_version" {
  description = "Desired Kubernetes version for Amazon EKS (Standard Support: 1.34 - 1.36)"
  type        = string
  default     = "1.36"
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS managed node group"
  type        = list(string)
  default     = ["t3.micro"]
}

variable "enable_docdb" {
  description = "Enable Amazon DocumentDB cluster. Set to false for AWS Free Plan accounts that restrict DocumentDB."
  type        = bool
  default     = false
}

variable "enable_ebs_csi" {
  description = "Enable AWS EBS CSI Driver addon. Set to false for dev/free-tier or when state is managed by external RDS/Redis/MQ."
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "Whether to provision NAT Gateways. Set to false in dev to save ~$35/month."
  type        = bool
  default     = true
}


