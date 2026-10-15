variable "project_name" {
  description = "Base project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
}

variable "rds_subnet_group_name" {
  description = "DB Subnet Group name for RDS MySQL"
  type        = string
}

variable "docdb_subnet_group_name" {
  description = "Cluster Subnet Group name for Amazon DocumentDB"
  type        = string
}

variable "elasticache_subnet_group_name" {
  description = "Subnet Group name for Amazon ElastiCache Redis"
  type        = string
}

variable "isolated_db_subnet_ids" {
  description = "List of Tier 3 isolated database subnet IDs (for Amazon MQ multi-AZ)"
  type        = list(string)
}

variable "database_security_group_id" {
  description = "Security Group ID for Tier 3 database access"
  type        = string
}

variable "mysql_username" {
  description = "Master username for RDS MySQL"
  type        = string
}

variable "mysql_password" {
  description = "Master password for RDS MySQL"
  type        = string
  sensitive   = true
}

variable "docdb_username" {
  description = "Master username for Amazon DocumentDB"
  type        = string
}

variable "docdb_password" {
  description = "Master password for Amazon DocumentDB"
  type        = string
  sensitive   = true
}

variable "mq_username" {
  description = "Master username for Amazon MQ RabbitMQ"
  type        = string
}

variable "mq_password" {
  description = "Master password for Amazon MQ RabbitMQ"
  type        = string
  sensitive   = true
}

variable "enable_docdb" {
  description = "Enable Amazon DocumentDB cluster. Set to false for Free Plan accounts."
  type        = bool
  default     = false
}

variable "enable_rds" {
  description = "Enable Amazon RDS MySQL instance."
  type        = bool
  default     = true
}

variable "enable_redis" {
  description = "Enable Amazon ElastiCache Redis cluster."
  type        = bool
  default     = true
}

variable "enable_mq" {
  description = "Enable Amazon MQ RabbitMQ broker."
  type        = bool
  default     = true
}

