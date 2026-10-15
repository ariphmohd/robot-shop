output "mysql_endpoint" {
  description = "Connection hostname for Amazon RDS MySQL"
  value       = var.enable_rds && length(aws_db_instance.mysql) > 0 ? aws_db_instance.mysql[0].address : "mysql"
}

output "mysql_port" {
  description = "Connection port for Amazon RDS MySQL"
  value       = var.enable_rds && length(aws_db_instance.mysql) > 0 ? aws_db_instance.mysql[0].port : 3306
}

output "docdb_endpoint" {
  description = "Connection hostname for Amazon DocumentDB cluster or in-cluster MongoDB"
  value       = var.enable_docdb && length(aws_docdb_cluster.docdb) > 0 ? aws_docdb_cluster.docdb[0].endpoint : "mongodb"
}

output "docdb_port" {
  description = "Connection port for Amazon DocumentDB"
  value       = var.enable_docdb && length(aws_docdb_cluster.docdb) > 0 ? aws_docdb_cluster.docdb[0].port : 27017
}

output "redis_endpoint" {
  description = "Primary endpoint address for Amazon ElastiCache Redis"
  value       = var.enable_redis && length(aws_elasticache_replication_group.redis) > 0 ? aws_elasticache_replication_group.redis[0].primary_endpoint_address : "redis"
}

output "redis_port" {
  description = "Port for Amazon ElastiCache Redis"
  value       = 6379
}

output "mq_broker_id" {
  description = "Broker ID for Amazon MQ RabbitMQ"
  value       = var.enable_mq && length(aws_mq_broker.rabbitmq) > 0 ? aws_mq_broker.rabbitmq[0].id : ""
}

output "mq_endpoint" {
  description = "AMQP endpoint for Amazon MQ RabbitMQ"
  value       = var.enable_mq && length(aws_mq_broker.rabbitmq) > 0 && length(aws_mq_broker.rabbitmq[0].instances) > 0 ? aws_mq_broker.rabbitmq[0].instances[0].endpoints[0] : "rabbitmq"
}

