aws_region          = "us-east-1"
environment         = "dev"
project_name        = "robotshop"
vpc_cidr            = "10.0.0.0/16"
single_nat_gateway  = true
kubernetes_version  = "1.36"
node_instance_types = ["t3.micro"]
enable_docdb        = false
enable_ebs_csi      = false
enable_nat_gateway  = false

