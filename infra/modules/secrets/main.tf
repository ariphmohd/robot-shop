# =============================================================================
# 1. Generate High-Entropy Cryptographic Passwords
# =============================================================================
# MySQL Password (alphanumeric to avoid URL encoding issues in Spring Boot / PHP)
resource "random_password" "mysql" {
  length  = 16
  special = false
}

# DocumentDB Password (alphanumeric to avoid URI parsing issues in Node.js MongoDB driver)
resource "random_password" "docdb" {
  length  = 16
  special = false
}

# Amazon MQ RabbitMQ Password (requires uppercase, lowercase, numbers, and allowed symbols)
resource "random_password" "mq" {
  length           = 16
  special          = true
  override_special = "!@#$%*-_+"
}


# =============================================================================
# 2. AWS Secrets Manager Secret Vault
# =============================================================================
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.project_name}-${var.environment}-db-credentials"
  description             = "Master credentials for RDS MySQL, DocumentDB, and Amazon MQ"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-db-credentials"
    Tier = "security"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    mysql_username = "robotshop_admin"
    mysql_password = random_password.mysql.result
    docdb_username = "robotshop_admin"
    docdb_password = random_password.docdb.result
    mq_username    = "robotshop_admin"
    mq_password    = random_password.mq.result
  })
}
