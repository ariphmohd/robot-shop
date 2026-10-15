output "secret_arn" {
  description = "The ARN of the AWS Secrets Manager secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "secret_name" {
  description = "The name of the AWS Secrets Manager secret"
  value       = aws_secretsmanager_secret.db_credentials.name
}

output "mysql_username" {
  description = "Master username for RDS MySQL"
  value       = "robotshop_admin"
}

output "mysql_password" {
  description = "Master password for RDS MySQL"
  value       = random_password.mysql.result
  sensitive   = true
}

output "docdb_username" {
  description = "Master username for Amazon DocumentDB"
  value       = "robotshop_admin"
}

output "docdb_password" {
  description = "Master password for Amazon DocumentDB"
  value       = random_password.docdb.result
  sensitive   = true
}

output "mq_username" {
  description = "Master username for Amazon MQ RabbitMQ"
  value       = "robotshop_admin"
}

output "mq_password" {
  description = "Master password for Amazon MQ RabbitMQ"
  value       = random_password.mq.result
  sensitive   = true
}
