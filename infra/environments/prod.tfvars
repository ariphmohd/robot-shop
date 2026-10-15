aws_region          = "us-east-1"
environment         = "prod"
project_name        = "robotshop"
vpc_cidr            = "10.0.0.0/16"
single_nat_gateway  = false
kubernetes_version  = "1.36"
node_instance_types = ["m6i.large", "m7i.large"]
enable_docdb        = true
enable_ebs_csi      = true
enable_nat_gateway  = true

