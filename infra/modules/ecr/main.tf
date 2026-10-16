data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  service_names = toset([
    "catalogue",
    "cart",
    "dispatch",
    "payment",
    "ratings",
    "shipping",
    "user",
    "web",
  ])

  repository_prefix = "${var.project_name}-${var.environment}"
}

# =============================================================================
# Private ECR repositories for application services
# =============================================================================
resource "aws_ecr_repository" "service" {
  for_each = local.service_names

  name                 = "${local.repository_prefix}/${each.value}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = "${local.repository_prefix}-${each.value}"
    Component = each.value
    Tier      = "ci"
  }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each = aws_ecr_repository.service

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain only the newest ${var.image_retention_count} immutable images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.image_retention_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# =============================================================================
# GitHub Actions OIDC identity and least-privilege ECR publisher role
# =============================================================================
resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]

  tags = {
    Name = "${local.repository_prefix}-github-actions-oidc"
    Tier = "ci"
  }
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"]
    }
  }
}

resource "aws_iam_role" "github_actions_ecr_push" {
  name               = "${local.repository_prefix}-github-actions-ecr-push"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  tags = {
    Name = "${local.repository_prefix}-github-actions-ecr-push"
    Tier = "ci"
  }
}

data "aws_iam_policy_document" "github_actions_ecr_push" {
  statement {
    sid       = "GetEcrAuthorizationToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "PushOnlyToRobotShopRepositories"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repository in aws_ecr_repository.service : repository.arn]
  }
}

resource "aws_iam_role_policy" "github_actions_ecr_push" {
  name   = "${local.repository_prefix}-ecr-push"
  role   = aws_iam_role.github_actions_ecr_push.id
  policy = data.aws_iam_policy_document.github_actions_ecr_push.json
}

# =============================================================================
# Optional private image-pull connectivity for production EKS worker nodes
# =============================================================================
resource "aws_security_group" "ecr_endpoints" {
  count = var.enable_vpc_endpoints ? 1 : 0

  name        = "${local.repository_prefix}-ecr-endpoints-sg"
  description = "Allows EKS worker nodes to access private Amazon ECR endpoints over HTTPS"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.repository_prefix}-ecr-endpoints-sg"
    Tier = "app"
  }

  lifecycle {
    precondition {
      condition = (
        var.vpc_id != null &&
        var.eks_nodes_security_group_id != null &&
        length(var.private_app_subnet_ids) > 0 &&
        length(var.private_app_route_table_ids) > 0
      )
      error_message = "VPC ID, EKS node security group, private application subnets, and private application route tables are required when enable_vpc_endpoints is true."
    }
  }
}

resource "aws_security_group_rule" "ecr_endpoints_ingress_https" {
  count = var.enable_vpc_endpoints ? 1 : 0

  type                     = "ingress"
  description              = "Allow HTTPS from EKS worker nodes"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = var.eks_nodes_security_group_id
  security_group_id        = aws_security_group.ecr_endpoints[0].id
}

resource "aws_security_group_rule" "ecr_endpoints_egress_all" {
  count = var.enable_vpc_endpoints ? 1 : 0

  type              = "egress"
  description       = "Allow endpoint response traffic"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecr_endpoints[0].id
}

resource "aws_vpc_endpoint" "ecr_api" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.ecr_endpoints[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${local.repository_prefix}-ecr-api-endpoint"
    Tier = "app"
  }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_app_subnet_ids
  security_group_ids  = [aws_security_group.ecr_endpoints[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${local.repository_prefix}-ecr-dkr-endpoint"
    Tier = "app"
  }
}

resource "aws_vpc_endpoint" "s3" {
  count = var.enable_vpc_endpoints ? 1 : 0

  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.private_app_route_table_ids

  tags = {
    Name = "${local.repository_prefix}-s3-gateway-endpoint"
    Tier = "app"
  }
}
