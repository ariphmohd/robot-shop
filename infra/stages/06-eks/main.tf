locals {
  cluster_name = "${var.project_name}-${var.environment}-eks"
}

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

module "eks" {
  source = "../../modules/eks"

  project_name                = var.project_name
  environment                 = var.environment
  cluster_name                = local.cluster_name
  kubernetes_version          = var.kubernetes_version
  node_instance_types         = var.node_instance_types
  enable_ebs_csi              = var.enable_ebs_csi
  vpc_id                      = data.terraform_remote_state.vpc.outputs.vpc_id
  public_subnet_ids           = data.terraform_remote_state.vpc.outputs.public_subnet_ids
  private_app_subnet_ids      = data.terraform_remote_state.vpc.outputs.private_app_subnet_ids
  eks_nodes_security_group_id = data.terraform_remote_state.security_groups.outputs.eks_nodes_security_group_id
  secrets_manager_arn         = data.terraform_remote_state.secrets.outputs.secret_arn
  enable_nat_gateway          = var.enable_nat_gateway
}

