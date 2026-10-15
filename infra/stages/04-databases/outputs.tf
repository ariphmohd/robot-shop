output "rds_mysql_endpoint" {
  description = "Endpoint address for Amazon RDS MySQL"
  value       = module.databases.mysql_endpoint
}

output "docdb_endpoint" {
  description = "Cluster endpoint address for Amazon DocumentDB or in-cluster MongoDB"
  value       = module.databases.docdb_endpoint
}

output "redis_endpoint" {
  description = "Primary endpoint address for Amazon ElastiCache Redis"
  value       = module.databases.redis_endpoint
}

output "rabbitmq_endpoint" {
  description = "AMQP endpoint address for Amazon MQ RabbitMQ"
  value       = module.databases.mq_endpoint
}
