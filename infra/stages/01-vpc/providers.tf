provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      Stage       = "01-vpc"
      ManagedBy   = "Terraform"
    }
  }
}
