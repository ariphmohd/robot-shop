variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "kubernetes_version" {
  description = "Desired Kubernetes version for the EKS control plane (Standard Support: 1.34 - 1.36)"
  type        = string
  default     = "1.36"
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of Tier 1 Public Subnet IDs"
  type        = list(string)
}

variable "private_app_subnet_ids" {
  description = "List of Tier 2 Private App Subnet IDs for worker nodes"
  type        = list(string)
}

variable "eks_nodes_security_group_id" {
  description = "Security Group ID for EKS worker nodes"
  type        = string
}

variable "secrets_manager_arn" {
  description = "ARN of the AWS Secrets Manager vault for IRSA policy"
  type        = string
}

variable "enable_ebs_csi" {
  description = "Whether to enable the AWS EBS CSI Driver addon (not needed for stateless apps with managed RDS/Redis/MQ)"
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "Whether NAT Gateway is enabled. When false, worker nodes use public subnets (dev cost saving)."
  type        = bool
  default     = true
}

