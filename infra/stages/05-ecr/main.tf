data "terraform_remote_state" "vpc" {
  count = var.enable_ecr_vpc_endpoints ? 1 : 0

  backend = "local"
  config = {
    path = "../01-vpc/terraform.tfstate"
  }
}

data "terraform_remote_state" "security_groups" {
  count = var.enable_ecr_vpc_endpoints ? 1 : 0

  backend = "local"
  config = {
    path = "../02-security-groups/terraform.tfstate"
  }
}

module "ecr" {
  source = "../../modules/ecr"

  project_name                = var.project_name
  environment                 = var.environment
  aws_region                  = var.aws_region
  github_repository           = var.github_repository
  github_branch               = var.github_branch
  image_retention_count       = var.ecr_image_retention_count
  enable_vpc_endpoints        = var.enable_ecr_vpc_endpoints
  vpc_id                      = var.enable_ecr_vpc_endpoints ? data.terraform_remote_state.vpc[0].outputs.vpc_id : null
  private_app_subnet_ids      = var.enable_ecr_vpc_endpoints ? data.terraform_remote_state.vpc[0].outputs.private_app_subnet_ids : []
  private_app_route_table_ids = var.enable_ecr_vpc_endpoints ? data.terraform_remote_state.vpc[0].outputs.private_app_route_table_ids : []
  eks_nodes_security_group_id = var.enable_ecr_vpc_endpoints ? data.terraform_remote_state.security_groups[0].outputs.eks_nodes_security_group_id : null
}
