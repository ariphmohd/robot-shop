data "terraform_remote_state" "vpc" {
  backend = "local"
  config = {
    path = "../01-vpc/terraform.tfstate"
  }
}

module "security_groups" {
  source = "../../modules/security_groups"

  vpc_id       = data.terraform_remote_state.vpc.outputs.vpc_id
  project_name = var.project_name
  environment  = var.environment
}
