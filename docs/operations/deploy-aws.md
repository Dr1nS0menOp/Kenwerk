# Kenwerk on AWS

Written for: someone with an AWS account who wants Kenwerk running without a server of their own. Spec 099 holds the reasons behind each choice.

> **Status: the template is checked with cfn-lint in CI, but has not been deployed on AWS yet.** It needs a published release whose images on ghcr.io are public. Try it in a scratch account or region first.

There is no "Launch stack" button yet: such a link must name a template in an S3 bucket, and the project has none. A bucket named in a README that the project does not own could be taken by someone else and serve their template.

## What it makes

One CloudFormation stack with:

- **A VPC**: two public subnets for the load balancer and the task, two private ones for the database, which has no way to the internet.
- **RDS for PostgreSQL 16**, db.t4g.micro with 20 GB of encrypted gp3, protected from deletion, with automated backups for 7 days (up to 35) and a final snapshot when the stack is deleted.
- **EFS**, encrypted and only over TLS, with daily AWS Backup: one folder for stored files, `master.key` and the queue, as the user the server runs as, and one for the backups.
- **Secrets Manager** secrets for both database passwords and the backup key, all generated.
- **One ECS service of one Fargate task** (1 vCPU, 2 GB, arm64), with three containers: a first step that writes the secret files and makes the database role of the application (`kenwerk-backup app-role`); the **server**, which holds only the application role; and the **backup service** of Compose, which migrates, signs the audit checkpoints and makes an encrypted backup every 4 hours.
- **An Application Load Balancer**, and:
  - without a domain, **CloudFront** in front, which reaches the load balancer inside the VPC: the address is `https://<id>.cloudfront.net`;
  - with `DomainName` and `CertificateArn`, the load balancer on the internet with your certificate, TLS 1.3 and 1.2, and http redirected to https.

## Deploy

With the AWS CLI:

```sh
aws cloudformation deploy --stack-name kenwerk \
  --template-file deploy/aws/kenwerk.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides KenwerkVersion=v0.1.0
aws cloudformation describe-stacks --stack-name kenwerk --query 'Stacks[0].Outputs'
```

Or in the console: CloudFormation, Create stack, Upload a template file, `deploy/aws/kenwerk.yaml`, and tick that it creates IAM roles. It takes 15 to 25 minutes, most of it the database and CloudFront.

Open the `Url` output, add `/setup`, and enter the code from the log:

```sh
aws logs tail <log group> --since 1h | grep 'first setup'
```

`SetupCodeCommand` in the outputs holds this command with the log group filled in.

### With your own domain

Request a certificate for the name in ACM, in the same region, then:

```sh
aws cloudformation deploy --stack-name kenwerk --template-file deploy/aws/kenwerk.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides KenwerkVersion=v0.1.0 DomainName=wiki.example.com CertificateArn=arn:aws:acm:...
```

Point the name at the `LoadBalancerName` output with a CNAME or an alias record. Passkeys are bound to the address: choose it before people register them.

## Secrets

No secret is in the template. Secrets Manager generates them; the first step writes them as files on volumes of the task alone, and the server's volume holds only the application's address. **Copy the backup key to a password safe now** (the `BackupKeySecret` output): without it no backup can be restored. Its secret is kept when the stack is deleted.

`master.key` lives on EFS, as in Compose, because the backup service encrypts it into each backup. Every copy of the file system therefore carries the key that opens the files.

## The database connection

The task reaches RDS over TLS (`sslmode=require`) without checking the server's certificate: RDS signs with Amazon's own CA, which the images do not carry yet. The database sits on private subnets that only the task's security group may reach. Checking the certificate is planned (spec 099, D7).

## Mail and other settings

Every setting of [install.md](install.md) is an environment variable of the `kenwerk` container: add it to the task definition in the template, and update the stack. Put a password in Secrets Manager and add it under `Secrets` of the container.

## Backups and restore

- The backup service writes an encrypted backup every 4 hours to EFS and notes it, so upgrades find a recent backup. Administration, Backups shows them.
- RDS restores the database to any minute of its retention, into a new instance. AWS Backup restores EFS.
- To restore one of Kenwerk's own backups, copy the backup and the key to a machine with Docker and follow [backup-restore.md](backup-restore.md).
- `aws ecs execute-command` runs `kenwerk` commands in the task, such as `kenwerk setup-code`.

## Upgrade

Update the stack with the new version:

```sh
aws cloudformation deploy --stack-name kenwerk --template-file deploy/aws/kenwerk.yaml \
  --capabilities CAPABILITY_IAM --parameter-overrides KenwerkVersion=v0.2.0
```

The old task stops before the new one starts, so the embedded queue never has two owners: a minute or two without service. The backup service migrates after its backup. Read [upgrade.md](upgrade.md) first.

## What it costs

Roughly, at list prices for the defaults, in US dollars a month: Fargate about 30, RDS about 15, the load balancer about 20, CloudFront, EFS, the secrets and the task's public address a few. **About 70 in all.** Check with the [AWS pricing calculator](https://calculator.aws/).

## Remove it

```sh
aws rds modify-db-instance --db-instance-identifier <id> --no-deletion-protection --apply-immediately
aws cloudformation delete-stack --stack-name kenwerk
```

Kept on purpose, to delete by hand when you are sure: the database's final snapshot, the EFS file system with the files and the backups, and the backup key's secret.
