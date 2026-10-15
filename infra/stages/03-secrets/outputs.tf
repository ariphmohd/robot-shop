output "secret_arn" {
  description = "ARN of the AWS Secrets Manager secret"
  value       = module.secrets.secret_arn
}

output "secret_name" {
  description = "Name of the AWS Secrets Manager secret"
  value       = module.secrets.secret_name
}

output "mysql_username" {
  description = "Master username for RDS MySQL"
  value       = module.secrets.mysql_username
}

output "mysql_password" {
  description = "Generated master password for RDS MySQL"
  value       = module.secrets.mysql_password
  sensitive   = true
}

output "docdb_username" {
  description = "Master username for DocumentDB"
  value       = module.secrets.docdb_username
}

output "docdb_password" {
  description = "Generated master password for DocumentDB"
  value       = module.secrets.docdb_password
  sensitive   = true
}

output "mq_username" {
  description = "Master username for Amazon MQ"
  value       = module.secrets.mq_username
}

output "mq_password" {
  description = "Generated master password for Amazon MQ"
  value       = module.secrets.mq_password
  sensitive   = true
}
