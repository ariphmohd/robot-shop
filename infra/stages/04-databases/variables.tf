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

variable "enable_rds" {
  description = "Enable Amazon RDS MySQL instance"
  type        = bool
  default     = true
}

variable "enable_redis" {
  description = "Enable Amazon ElastiCache Redis cluster"
  type        = bool
  default     = true
}

variable "enable_mq" {
  description = "Enable Amazon MQ RabbitMQ broker"
  type        = bool
  default     = true
}

variable "enable_docdb" {
  description = "Enable Amazon DocumentDB cluster"
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

variable "kubernetes_version" {
  type    = string
  default = "1.36"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.micro"]
}

variable "enable_ebs_csi" {
  type    = bool
  default = false
}
