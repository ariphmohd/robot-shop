# =============================================================================
# 1. Amazon RDS for MySQL (Shipping & Ratings Microservices)
# =============================================================================
resource "aws_db_instance" "mysql" {
  count                 = var.enable_rds ? 1 : 0
  identifier            = "${var.project_name}-${var.environment}-mysql"
  engine                = "mysql"
  engine_version        = "8.0"
  instance_class        = var.environment == "prod" ? "db.m6i.large" : "db.t3.micro"
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"

  db_subnet_group_name   = var.rds_subnet_group_name
  vpc_security_group_ids = [var.database_security_group_id]
  multi_az               = var.environment == "prod" ? true : false
  publicly_accessible    = false

  username = var.mysql_username
  password = var.mysql_password

  skip_final_snapshot       = var.environment == "prod" ? false : true
  final_snapshot_identifier = "${var.project_name}-${var.environment}-mysql-final"

  tags = {
    Name = "${var.project_name}-${var.environment}-mysql"
    Tier = "database"
  }
}

# =============================================================================
# 2. Amazon DocumentDB (Catalog & User Authentication Microservices)
# =============================================================================
resource "aws_docdb_cluster" "docdb" {
  count              = var.enable_docdb ? 1 : 0
  cluster_identifier = "${var.project_name}-${var.environment}-docdb"
  engine             = "docdb"
  master_username    = var.docdb_username
  master_password    = var.docdb_password

  db_subnet_group_name   = var.docdb_subnet_group_name
  vpc_security_group_ids = [var.database_security_group_id]

  skip_final_snapshot       = var.environment == "prod" ? false : true
  final_snapshot_identifier = "${var.project_name}-${var.environment}-docdb-final"

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb"
    Tier = "database"
  }
}

resource "aws_docdb_cluster_instance" "docdb_instances" {
  count              = var.enable_docdb ? (var.environment == "prod" ? 3 : 1) : 0
  identifier         = "${var.project_name}-${var.environment}-docdb-${count.index + 1}"
  cluster_identifier = aws_docdb_cluster.docdb[0].id
  instance_class     = var.environment == "prod" ? "db.r6g.large" : "db.t3.medium"

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb-${count.index + 1}"
    Tier = "database"
  }
}


# =============================================================================
# 3. Amazon ElastiCache for Redis (Shopping Cart Microservice)
# =============================================================================
resource "aws_elasticache_replication_group" "redis" {
  count                      = var.enable_redis ? 1 : 0
  replication_group_id       = "${var.project_name}-${var.environment}-redis"
  description                = "Redis in-memory cache for shopping carts"
  node_type                  = var.environment == "prod" ? "cache.m6g.large" : "cache.t3.micro"
  num_cache_clusters         = var.environment == "prod" ? 3 : 1
  automatic_failover_enabled = var.environment == "prod" ? true : false

  subnet_group_name    = var.elasticache_subnet_group_name
  security_group_ids   = [var.database_security_group_id]
  port                 = 6379
  engine               = "redis"
  engine_version       = "7.0"
  parameter_group_name = "default.redis7"

  tags = {
    Name = "${var.project_name}-${var.environment}-redis"
    Tier = "database"
  }
}

# =============================================================================
# 4. Amazon MQ for RabbitMQ (Payment & Dispatch Microservices)
# =============================================================================
resource "aws_mq_broker" "rabbitmq" {
  count              = var.enable_mq ? 1 : 0
  broker_name        = "${var.project_name}-${var.environment}-rabbitmq"
  engine_type        = "RabbitMQ"
  engine_version     = "4.2"
  host_instance_type = var.environment == "prod" ? "mq.m7g.large" : "mq.m7g.large"
  storage_type       = "ebs"
  deployment_mode    = var.environment == "prod" ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"

  subnet_ids          = var.environment == "prod" ? var.isolated_db_subnet_ids : [var.isolated_db_subnet_ids[0]]
  security_groups     = [var.database_security_group_id]
  publicly_accessible = false

  user {
    username = var.mq_username
    password = var.mq_password
  }

  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-${var.environment}-rabbitmq"
    Tier = "database"
  }
}

