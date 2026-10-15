# =============================================================================
# 1. Tier 1: Application Load Balancer Security Group (Public Ingress)
# =============================================================================
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Security group for internet-facing Application Load Balancer"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
    Tier = "public"
  }
}

resource "aws_security_group_rule" "alb_ingress_http" {
  type              = "ingress"
  description       = "Allow HTTP traffic from public internet"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  description       = "Allow HTTPS traffic from public internet"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress_all" {
  type              = "egress"
  description       = "Allow ALB to forward traffic to backend target groups"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
}

# =============================================================================
# 2. Tier 2: EKS Worker Nodes & Pods Security Group (App Layer)
# =============================================================================
resource "aws_security_group" "eks_nodes" {
  name        = "${var.project_name}-${var.environment}-eks-nodes-sg"
  description = "Security group for EKS worker nodes and application microservices"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-eks-nodes-sg"
    Tier = "app"
  }
}

resource "aws_security_group_rule" "eks_nodes_ingress_from_alb" {
  type                     = "ingress"
  description              = "Allow web container traffic on port 8080 ONLY from ALB"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_ingress_self" {
  type              = "ingress"
  description       = "Allow intra-cluster node-to-node and pod-to-pod communication"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  self              = true
  security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_all" {
  type              = "egress"
  description       = "Allow worker nodes outbound access for Docker pulls and DB access"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eks_nodes.id
}

# =============================================================================
# 3. Tier 3: Isolated Database Security Group (PaaS Data Stores)
# =============================================================================
resource "aws_security_group" "database" {
  name        = "${var.project_name}-${var.environment}-database-sg"
  description = "Security group for RDS MySQL, DocumentDB, ElastiCache, and Amazon MQ"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.project_name}-${var.environment}-database-sg"
    Tier = "database"
  }
}

# 3a. Port 3306 (MySQL): Allowed ONLY from EKS worker nodes (shipping & ratings)
resource "aws_security_group_rule" "db_ingress_mysql" {
  type                     = "ingress"
  description              = "Allow MySQL traffic strictly from EKS worker nodes"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  security_group_id        = aws_security_group.database.id
}

# 3b. Port 27017 (DocumentDB / Mongo): Allowed ONLY from EKS worker nodes (catalogue & user)
resource "aws_security_group_rule" "db_ingress_docdb" {
  type                     = "ingress"
  description              = "Allow DocumentDB traffic strictly from EKS worker nodes"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  security_group_id        = aws_security_group.database.id
}

# 3c. Port 6379 (ElastiCache / Redis): Allowed ONLY from EKS worker nodes (cart)
resource "aws_security_group_rule" "db_ingress_redis" {
  type                     = "ingress"
  description              = "Allow Redis cache traffic strictly from EKS worker nodes"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  security_group_id        = aws_security_group.database.id
}

# 3d. Port 5672 (Amazon MQ / AMQP): Allowed ONLY from EKS worker nodes (payment & dispatch)
resource "aws_security_group_rule" "db_ingress_mq_amqp" {
  type                     = "ingress"
  description              = "Allow RabbitMQ AMQP traffic strictly from EKS worker nodes"
  from_port                = 5672
  to_port                  = 5672
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  security_group_id        = aws_security_group.database.id
}

# 3e. Port 15672 (Amazon MQ / RabbitMQ Web Console): Allowed from EKS nodes
resource "aws_security_group_rule" "db_ingress_mq_mgmt" {
  type                     = "ingress"
  description              = "Allow RabbitMQ management web UI strictly from EKS nodes"
  from_port                = 15672
  to_port                  = 15672
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  security_group_id        = aws_security_group.database.id
}
