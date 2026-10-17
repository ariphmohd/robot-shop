# Operational Scripts

## ECR cleanup

`ecr_cleanup.py` is a deliberately guarded utility for inspecting ECR
repositories selected by a name prefix. It uses the AWS credentials available
to the AWS CLI/SDK on the computer where it runs.

Install its isolated dependency first:

```bash
python3 -m pip install -r scripts/requirements.txt
```

Run a dry-run first:

```bash
python3 scripts/ecr_cleanup.py \
  --repository-prefix robotshop-dev/ \
  --region us-east-1
```

To prepare Terraform-managed repositories for a normal `terraform destroy`,
delete only their images. This is the recommended action because the ECR
repositories remain in Terraform state and Terraform can then remove them:

```bash
python3 scripts/ecr_cleanup.py \
  --repository-prefix robotshop-dev/ \
  --region us-east-1 \
  --action purge-images \
  --execute

cd infra/stages/05-ecr
terraform destroy -var-file=../../environments/dev.tfvars
```

`delete-repositories` invokes the ECR force-delete API and permanently removes
the image data and repositories themselves:

```bash
python3 scripts/ecr_cleanup.py \
  --repository-prefix robotshop-dev/ \
  --region us-east-1 \
  --action delete-repositories \
  --execute
```

Do not use `delete-repositories` for repositories still managed by Terraform:
it creates Terraform state drift. Use it only for orphaned repositories or
after their Terraform resources and state have already been removed.
