data "aws_availability_zones" "available" {
  state = "available"
}

# -----------------------------------------------------------------------------
# 1. Virtual Private Cloud (VPC)
# -----------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name                                           = "${var.project_name}-${var.environment}-vpc"
    "kubernetes.io/cluster/${var.cluster_name}"     = "shared"
  }
}

# -----------------------------------------------------------------------------
# 2. Tier 1: Public Subnets (ALB & NAT Gateway)
# -----------------------------------------------------------------------------
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                        = "${var.project_name}-${var.environment}-public-${data.aws_availability_zones.available.names[count.index]}"
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    Tier                                        = "public"
  }
}

# -----------------------------------------------------------------------------
# 3. Tier 2: Private App Subnets (EKS Worker Nodes & Microservices)
# -----------------------------------------------------------------------------
resource "aws_subnet" "private_app" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name                                        = "${var.project_name}-${var.environment}-private-app-${data.aws_availability_zones.available.names[count.index]}"
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    Tier                                        = "app"
  }
}

# -----------------------------------------------------------------------------
# 4. Tier 3: Isolated Database Subnets (Air-Gapped: Zero Internet Route)
# -----------------------------------------------------------------------------
resource "aws_subnet" "isolated_db" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 20)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-${var.environment}-isolated-db-${data.aws_availability_zones.available.names[count.index]}"
    Tier = "database"
  }
}

# -----------------------------------------------------------------------------
# 5. Internet Gateway (IGW)
# -----------------------------------------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-${var.environment}-igw"
  }
}

# -----------------------------------------------------------------------------
# 6. Elastic IPs & NAT Gateway(s)
# -----------------------------------------------------------------------------
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : 3) : 0
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-eip-${count.index + 1}"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : 3) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.project_name}-${var.environment}-nat-${count.index + 1}"
  }

  depends_on = [aws_internet_gateway.main]
}

# -----------------------------------------------------------------------------
# 7. Route Tables
# -----------------------------------------------------------------------------
# Public Route Table: Routes 0.0.0.0/0 to Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-public-rt"
  }
}

# Private App Route Tables: Routes 0.0.0.0/0 to NAT Gateway (when enabled)
resource "aws_route_table" "private_app" {
  count  = var.single_nat_gateway ? 1 : 3
  vpc_id = aws_vpc.main.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.main[count.index].id
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-private-app-rt-${count.index + 1}"
  }
}


# Isolated Database Route Table: Local VPC ONLY (Zero Internet route)
resource "aws_route_table" "isolated_db" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-${var.environment}-isolated-db-rt"
  }
}

# -----------------------------------------------------------------------------
# 8. Route Table Associations
# -----------------------------------------------------------------------------
resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_app" {
  count          = 3
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[var.single_nat_gateway ? 0 : count.index].id
}

resource "aws_route_table_association" "isolated_db" {
  count          = 3
  subnet_id      = aws_subnet.isolated_db[count.index].id
  route_table_id = aws_route_table.isolated_db.id
}

# -----------------------------------------------------------------------------
# 9. Managed Database Subnet Groups (Attached strictly to Tier 3 Isolated Subnets)
# -----------------------------------------------------------------------------
resource "aws_db_subnet_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds-subnet-group"
  subnet_ids  = aws_subnet.isolated_db[*].id
  description = "Database subnet group for Amazon RDS MySQL in isolated tier"

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-subnet-group"
  }
}

resource "aws_docdb_subnet_group" "docdb" {
  name        = "${var.project_name}-${var.environment}-docdb-subnet-group"
  subnet_ids  = aws_subnet.isolated_db[*].id
  description = "Cluster subnet group for Amazon DocumentDB in isolated tier"

  tags = {
    Name = "${var.project_name}-${var.environment}-docdb-subnet-group"
  }
}

resource "aws_elasticache_subnet_group" "elasticache" {
  name        = "${var.project_name}-${var.environment}-redis-subnet-group"
  subnet_ids  = aws_subnet.isolated_db[*].id
  description = "Subnet group for Amazon ElastiCache Redis in isolated tier"

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-subnet-group"
  }
}
