data "terraform_remote_state" "vpc" {
  backend = "local"
  config = {
    path = "../01-vpc/terraform.tfstate"
  }
}

data "terraform_remote_state" "security_groups" {
  backend = "local"
  config = {
    path = "../02-security-groups/terraform.tfstate"
  }
}

data "terraform_remote_state" "secrets" {
  backend = "local"
  config = {
    path = "../03-secrets/terraform.tfstate"
  }
}

module "databases" {
  source = "../../modules/databases"

  project_name                  = var.project_name
  environment                   = var.environment
  rds_subnet_group_name         = data.terraform_remote_state.vpc.outputs.rds_subnet_group_name
  docdb_subnet_group_name       = data.terraform_remote_state.vpc.outputs.docdb_subnet_group_name
  elasticache_subnet_group_name = data.terraform_remote_state.vpc.outputs.elasticache_subnet_group_name
  isolated_db_subnet_ids        = data.terraform_remote_state.vpc.outputs.isolated_db_subnet_ids
  database_security_group_id    = data.terraform_remote_state.security_groups.outputs.database_security_group_id

  mysql_username = data.terraform_remote_state.secrets.outputs.mysql_username
  mysql_password = data.terraform_remote_state.secrets.outputs.mysql_password
  docdb_username = data.terraform_remote_state.secrets.outputs.docdb_username
  docdb_password = data.terraform_remote_state.secrets.outputs.docdb_password
  mq_username    = data.terraform_remote_state.secrets.outputs.mq_username
  mq_password    = data.terraform_remote_state.secrets.outputs.mq_password

  enable_rds   = var.enable_rds
  enable_redis = var.enable_redis
  enable_mq    = var.enable_mq
  enable_docdb = var.enable_docdb
}
