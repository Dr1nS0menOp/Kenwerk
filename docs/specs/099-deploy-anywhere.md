# 099: Deploy anywhere

Status: built (templates validated without cloud accounts; not yet run on a cloud)
Phase: hardening before 1.0 (wave DP1)

## Problem

The product owner wants many ways to deploy Kenwerk, with one-click buttons on the repository's front page for Azure, Google Cloud and AWS, and ready modules for Terraform, OpenTofu and Helm, "so you can deploy this app in no time". Today there are Docker Compose (the reference), a Helm chart that is only in the repository, an LXC script, and `.deb`/`.rpm` packages. None of them makes a managed database, an address with https, or the secrets for you on a cloud.

A button that deploys something unsafe, or something that loses data at its first upgrade, is worse than no button. So this spec first studies what Kenwerk needs from any platform, then decides per target what the button or module creates, and states plainly what was checked and what still needs a cloud account.

## Study: what Kenwerk needs from any platform

Read from `compose.yaml`, `deploy/`, `docs/operations/install.md`, `upgrade.md`, `backup-restore.md`, `internal/db`, `internal/queue` and `internal/keys` on main at c17fbe0.

| Need | Where it comes from | What a platform must give |
|---|---|---|
| **Two database roles** | `internal/db.GrantApp`, `deploy/postgres-init.sh`, spec 070 | An owner of the tables, which migrates, and an application role that owns nothing, so it cannot touch the audit log's triggers. Kenwerk grants the tables to the application role after each migration; **the role itself must exist first**, with `CONNECT` and `USAGE` on `public`. Compose makes it in an init script of the `postgres` image, the LXC script with `psql`. A managed database runs no such script |
| **pg_trgm** | spec 047 | The owner creates it. It is a trusted extension, so a database owner who is no superuser may create it, but Azure allows only extensions named in `azure.extensions` |
| **Who migrates** | spec 070, `compose.yaml` | In Compose the server holds only the application role (`KENWERK_MIGRATE_ON_START=false`), and the backup service, which holds the owner, migrates and signs the audit checkpoints. The Helm chart gives the pod both addresses, and the pod migrates itself |
| **A backup before an upgrade** | ADR-040, `upgrade.md` | An upgrade waits when no backup was noted in 24 hours. The backup service notes each of its backups; a backup made another way is noted with `kenwerk backup note` |
| **One node** | `install.md`, `limits.md` | Sized for one node. Role `all` runs the embedded NATS JetStream, which keeps its files in `KENWERK_DATA_DIR/nats` (`internal/queue`). **Two servers may never share that folder**: the chart uses `strategy: Recreate` for this reason |
| **Files** | `internal/storage` | Attachments live on a volume until an S3 store exists (phase 3). The volume must survive restarts and be POSIX enough for create-exclusive and rename |
| **master.key** | `internal/keys` | 32 raw bytes (or a magic header and 64 bytes): binary, not text. Created in the data folder on first start unless `KENWERK_MASTER_KEY_FILE` names a file. Compose keeps it in the data volume, because the backup service reads `/data/master.key` and encrypts it into each backup |
| **The backup key** | `scripts/setup-secrets.sh`, spec 054 | Text (base64 of 32 bytes), kept apart from the backups. Losing it makes every backup unreadable, so it must outlive a redeployment |
| **Public address** | `install.md` | `KENWERK_PUBLIC_URL`, a host name and not an IP address, https in production. It must be known when the container starts |
| **Client addresses** | `KENWERK_TRUSTED_PROXIES` | The load balancer's addresses, so rate limits count people and not the load balancer |
| **TLS to the database** | `install.md`, SEC-625 | `sslmode=verify-full` with the server's CA for a database on another machine. pgx 5.12 reads `sslrootcert=system` as the system's roots (checked in its `pgconn/config.go`), and so does libpq 16, which `pg_dump` in the backup image uses |
| **Images** | `release.yml` | `ghcr.io/<owner>/kenwerk`, `kenwerk-backup` and `kenwerk-collab`, tagged `vX.Y.Z`, for amd64 and arm64, only when a tag is pushed. **No tag exists yet**, so no image is published |

What each kind of platform offers, from the platforms' public documentation:

| | Azure Container Apps | AWS ECS on Fargate | Google Cloud Run | Kubernetes (GKE, AKS, EKS, any) |
|---|---|---|---|---|
| A step that runs to its end before the app | init containers | a container with `dependsOn: SUCCESS` | none in a service; a separate job | init containers |
| A sidecar | yes | yes | yes | yes |
| A persistent POSIX volume | Azure Files | EFS | only Filestore (NFS, from about 1 TiB) or Cloud Storage FUSE, which is not POSIX enough for the queue | a persistent volume |
| Old and new revision overlap | yes, always, briefly | can be prevented (minimum healthy 0 %) | yes | can be prevented (`Recreate`) |
| An https address without a domain | yes, `*.azurecontainerapps.io` | through CloudFront, `*.cloudfront.net` | yes, `*.run.app` | no: a domain is needed |
| Secrets as files | yes | no: environment only | yes | yes |
| Binary secrets | no | no | yes | yes |

## Decision

Decided on the product owner's behalf on 2026-11-22, may be overruled.

- **D1. Every cloud target runs the Compose layout, not a new one.** Where the platform has sidecars (Azure, AWS), the task is the three parts of `compose.yaml`: a first step, the server with only the application role and `KENWERK_MIGRATE_ON_START=false`, and the backup service with the owner, which migrates, signs the checkpoints and notes each backup (spec 070). So the cloud gets the same protection of the audit log, backups that the console shows and that restore with `scripts/restore.sh`, and upgrades that find a recent backup. On Kubernetes the chart keeps its own layout (the pod migrates), which is unchanged.
- **D2. One new command makes the application role: `kenwerk-backup app-role`.** It runs in the backup image, which has `psql`, before the server starts. As the owner, it makes the role named in the application's address, or sets that address's password on it, and grants `CONNECT` on the database and `USAGE` on `public`, as `deploy/postgres-init.sh` does. The name and password reach `psql` through its environment, never its command line, and `psql` quotes them (`:"name"`, `:'password'`). It refuses an application role that is the owner, a superuser, may create roles, bypasses row security or holds the owner's rights. Running it twice changes nothing; a redeployment with new passwords sets the new one. Tested against PostgreSQL 16 (`scripts/deploy-check/app-role-test.sh`). Rejected: a Go command, which would put role management into the server binary; inline SQL in four templates, which would drift.
- **D3. The owner is the managed server's administrator.** Azure's administrator, Cloud SQL's built-in user and RDS's master user may each create roles and own the database the platform made, which is what the owner needs. A separate `kenwerk_owner` under the administrator would need different steps on each platform for one gain (the administrator's password would not be in the app); it is a follow-up for the product owner to choose. The administrator is named `kenwerk_owner` where the platform allows the name.
- **D4. Secrets are generated by the platform, never written in a template.** Azure: two `newGuid()` defaults of `@secure()` parameters, so each deployment sets new passwords on the database and in the app at once, and the backup key is made once by the first step on its own file share. AWS: Secrets Manager generates both passwords and the backup key; the backup key's secret is kept when the stack is deleted. Terraform: `random_password` and `random_bytes`, kept in the state, which must therefore be treated as secret and encrypted. Every generated password is letters and digits (and dashes on Azure), so an address needs no escaping.
- **D5. master.key stays in the data volume on Azure and AWS, as in Compose.** The backup service reads it from there and encrypts it into each backup. Container Apps and ECS secrets are text, and the key is binary. On Kubernetes the module puts it in the Secret, apart from the data, as the chart already expects. A text form of the key file, so any secret store could hold it, is a follow-up (a change in `internal/keys`).
- **D6. The embedded queue on a replica's own disk on Azure.** Container Apps always starts the new revision before it stops the old one. The queue's folder is a separate temporary volume mounted over `/var/lib/kenwerk/nats`, so two queues never share files; the outbox in PostgreSQL is the source of every event, and several relays may run at once (`internal/outbox`). The cost: events handed to a replica's queue and not yet handled when it stops are lost. On AWS and Kubernetes the old task stops first, so the queue stays on the persistent volume.
- **D7. TLS to the database.** Azure: `verify-full` against the system's roots (the server's certificate is from a public CA). Google Cloud: `verify-ca` with the instance's own CA, which Terraform reads and puts in the Secret (the certificate names the instance, not its address). AWS: **`require`**, encrypted but not checked, because RDS signs with Amazon's own CA, which neither image carries; the database is on private subnets reachable only from the task's security group. Carrying the RDS CA bundle is a follow-up.
- **D8. Azure: a "Deploy to Azure" button with a Bicep template**, compiled to `deploy/azure/azuredeploy.json`, which CI checks is exactly the build of `main.bicep`. It creates a virtual network, a PostgreSQL 16 flexible server on a private subnet with no public access, a storage account reachable only from the apps' subnet with three file shares (`data`, `backups`, `keys`), a Container Apps environment in the network, and one app with one replica: the first step, the server, and the backup service. The address is `https://<name>.<environment>.<region>.azurecontainerapps.io`, known before the app starts.
- **D9. AWS: a CloudFormation template, without a "Launch stack" button for now.** A Launch Stack link must name a template in an S3 bucket; a bucket named in our README that we do not own could be taken by anyone and serve their template. The button comes once the product owner publishes the template to a bucket the project owns. Until then `aws cloudformation deploy` or the console's "Upload a template file". The template creates a VPC (public subnets for the load balancer and the task, private ones for the database), RDS for PostgreSQL 16 with `DeletionProtection` and a snapshot on delete, EFS with access points for the data (as user 65532) and the backups, an ECS service of one Fargate task (arm64) with the three containers, an Application Load Balancer, and CloudFront. Without a domain the load balancer is internal, and CloudFront reaches it through a VPC origin, so the address is `https://<id>.cloudfront.net` and client addresses survive (CloudFront's origin addresses are in the VPC, which is trusted). With `DomainName` and an ACM `CertificateArn`, the load balancer faces the internet with TLS 1.3 and 1.2 and CloudFront is not made. App Runner was rejected: it has no persistent volume and pulls only from ECR.
- **D10. Google Cloud: an "Open in Cloud Shell" button for a Terraform example on GKE Autopilot.** It creates a network, Cloud SQL for PostgreSQL 16 on a private address with daily backups and point-in-time recovery, an Autopilot cluster, a global address, and Kenwerk through the module and chart, with Google's load balancer and a Google-managed certificate. It needs a domain: point its A record at the output address. Cloud Run was rejected for now: no step runs before the server, the only persistent volumes are Filestore (expensive) or Cloud Storage FUSE (not POSIX enough for the queue and the key file), and the CPU must be bought always-on for the workers anyway. Revisit when files go to S3 or GCS and the queue can live in PostgreSQL.
- **D11. Terraform and OpenTofu: one provider-neutral module, `deploy/terraform/modules/kenwerk`.** It installs the chart on any Kubernetes cluster against a PostgreSQL you give it, generates the application password and master.key, writes the Secret, and turns on the chart's new `databaseInit`. It uses only the `helm`, `kubernetes` and `random` providers. Examples: `examples/google-cloud` (D10) and `examples/kubernetes` (a cluster and a database you have). Azure and AWS have their native templates; Terraform examples on AKS and EKS are a follow-up, because each needs a cluster the size of a second product. The module works with OpenTofu 1.6 and later and Terraform 1.5 and later, and CI validates it with both.
- **D12. Helm: the chart is published as an OCI artifact on ghcr.io**, by the release workflow on a tag only: `oci://ghcr.io/<owner>/charts/kenwerk`, version `X.Y.Z`, appVersion `vX.Y.Z` (the images' tag), signed with cosign like the images, and attached to the release. Rejected: a GitHub Pages repository, which needs a branch and an index to keep. The chart also gains `databaseInit` (D2), `ingress.annotations` and `extraObjects` (for a cloud's own resources, such as a certificate), and its default image is the published one.
- **D13. One replica everywhere,** as Kenwerk is sized for one node. No button offers more.
- **D14. Cost notes are rough list prices**, in US dollars a month, for the defaults, and say so; each page links to the provider's calculator.
- **D15. Validation without accounts is a CI job**, `deploy`, and `make deploy-check`: `helm lint --strict` and `helm template` of three value sets through `kubeconform -strict` against Kubernetes 1.33, with checks of what the chart promises; `tofu validate` and `terraform validate` with `fmt -check` of the module and both examples; `bicep lint` and `bicep build`, compared with `azuredeploy.json` as templates (Bicep's order of `dependsOn`, and so its `templateHash`, changes from run to run); `cfn-lint` with warnings as failures; and the app-role test. Each tool is pinned by version and sha256 in `scripts/deploy-check.sh` (cfn-lint and its packages in `scripts/deploy-check/cfn-lint.txt`, by hash).
- **D16. Licences of the validators.** All run in CI only and never ship. Helm, kubeconform, Bicep: Apache-2.0 or MIT. OpenTofu and Terraform 1.5.7, and the `hashicorp/*` providers the module names: MPL-2.0. Terraform after 1.5.7 is BUSL-1.1, so CI pins 1.5.7, the last MPL-2.0 release; operators may of course use any Terraform. cfn-lint is MIT-0, and one of its packages, `typing_extensions`, is PSF-2.0. MPL-2.0 for the Terraform tools was allowed by the coordinator for the CLI; extending it to the providers, MIT-0 and PSF-2.0 is part of this decision and listed in `docs/dependencies.md`.

## Per target

### Azure (Container Apps)

| | |
|---|---|
| Button | `https://portal.azure.com/#create/Microsoft.Template/uri/` + the address of `deploy/azure/azuredeploy.json` on `main`, URL-encoded |
| Asks | `kenwerkVersion` (required), `name`, region, database machine and tier, backup days |
| Creates | Log Analytics workspace, virtual network (apps /23, database /24), private DNS zone, PostgreSQL 16 flexible server (Burstable B1ms, 32 GB, `azure.extensions=PG_TRGM`), database `kenwerk`, storage account (TLS 1.2, no public blobs, only the apps' subnet), shares `data`, `backups`, `keys`, Container Apps environment, the app |
| Secrets | Passwords from `newGuid()` at each deployment, in Container Apps secrets, mounted as files: the server sees only the application address; the first step and the backup service see both. The backup key is made once on the `keys` share |
| Database roles | Owner = the administrator `kenwerk_owner`; `kenwerk_app` made by the first step |
| Backups | The backup service every 4 hours to the `backups` share, kept 42; the server's own backups with point-in-time restore for 7 days (up to 35); the shares keep deleted files 14 days |
| HTTPS | The platform's certificate on `*.azurecontainerapps.io`; a custom domain with a free managed certificate is added in the portal (docs page), and `KENWERK_PUBLIC_URL` changed with it |
| Public URL | `https://<name>.<defaultDomain>`, set by the template |
| Upgrade | Deploy the template again with the new `kenwerkVersion` (new passwords are set on both sides), or `az containerapp update --image` for both images. The backup service migrates after its noted backup |
| Cost | About 60 to 80 dollars: the app about 40 to 55 (0.75 vCPU, 1.5 GiB, always on), the database about 15 to 20, files and logs a few |
| Teardown | `az group delete --name <group>`. The database's own backups go with it: copy `backups` and the `keys` share first |

### AWS (ECS on Fargate)

| | |
|---|---|
| Button | None yet (D9). `aws cloudformation deploy --template-file deploy/aws/kenwerk.yaml --stack-name kenwerk --capabilities CAPABILITY_IAM --parameter-overrides KenwerkVersion=v0.1.0` |
| Asks | `KenwerkVersion` (required), optional `DomainName` and `CertificateArn`, database class, backup days |
| Creates | VPC, subnets, security groups, three Secrets Manager secrets, RDS PostgreSQL 16.13 (db.t4g.micro, 20 GB gp3, encrypted), EFS (encrypted, TLS required, AWS Backup on) with two access points, log group, ECS cluster, task (1 vCPU, 2 GB, arm64), service, load balancer, CloudFront with a VPC origin |
| Secrets | Generated by Secrets Manager; the first step writes them as files on task-local volumes: the server's volume holds only the application address |
| Database roles | Owner = the master user `kenwerk_owner`; `kenwerk_app` made by the first step |
| Backups | The backup service to EFS; RDS automated backups for 7 days (up to 35) and a snapshot when the stack is deleted; AWS Backup of EFS daily |
| HTTPS | CloudFront's certificate, or yours on the load balancer |
| Public URL | `https://<id>.cloudfront.net` or `https://<DomainName>` |
| Upgrade | Update the stack with a new `KenwerkVersion`. The old task stops before the new one starts: a minute or two without service |
| Cost | About 70 dollars: Fargate about 30, RDS about 15, the load balancer about 20, CloudFront, EFS, secrets and the public address a few |
| Teardown | Turn off the database's deletion protection, delete the stack; the final snapshot, the EFS file system and the backup key's secret are kept on purpose and deleted by hand |

### Google Cloud (GKE Autopilot, Terraform)

| | |
|---|---|
| Button | "Open in Cloud Shell" on this repository, opening `deploy/terraform/examples/google-cloud` with its tutorial |
| Asks | `project`, `domain`, `kenwerk_version`; region and database machine have defaults |
| Creates | Network, private services access, Cloud SQL PostgreSQL 16 (private address only, TLS only), database and owner user, Autopilot cluster, global address, namespace, Secret, the chart with `databaseInit`, a managed certificate and an https redirect |
| Secrets | `random_password` and `random_bytes` in the state and the Secret |
| Database roles | Owner = the built-in user `kenwerk_owner` (member of `cloudsqlsuperuser`); `kenwerk_app` made by the chart's first step |
| Backups | Cloud SQL daily backups kept 7, point-in-time recovery 7 days. Files on the persistent disk: a volume snapshot. Before an upgrade, take an on-demand Cloud SQL backup and note it (`kubectl exec deploy/kenwerk -- kenwerk backup note`) |
| HTTPS | Google-managed certificate for the domain, active within an hour of the A record |
| Upgrade | `tofu apply -var kenwerk_version=vX.Y.Z` |
| Cost | About 50 to 70 dollars: Cloud SQL db-g1-small about 25, the pod about 20, the load balancer about 18; the cluster fee is covered by Google's free tier for one Autopilot cluster |
| Teardown | `tofu apply -var deletion_protection=false`, then `tofu destroy` |

### Terraform and OpenTofu (any Kubernetes)

`deploy/terraform/modules/kenwerk`, used by both examples. Inputs: namespace, public URL, chart and version, image tag, the database (host, port, name, owner, sslmode, CA), ingress, trusted proxies, extra settings and objects. Outputs: the address, the Secret, the command for the setup code.

### Helm

`helm install wiki oci://ghcr.io/dr1ns0menop/charts/kenwerk --version 0.1.0 --set publicUrl=https://wiki.example.com --set databaseInit.enabled=true`, once a release published it. The chart still needs the Secret described in `values.yaml`; the Terraform module makes it.

## What needs a published release

Every target pulls `ghcr.io/dr1ns0menop/kenwerk:vX.Y.Z` and `kenwerk-backup:vX.Y.Z`, and the Helm and Terraform paths the chart. **None of the buttons works before the first release tag is pushed, and the packages on ghcr.io are made public.** The first tag is the product owner's decision: this wave creates none. The Azure template asks for the version instead of defaulting to one, so nobody deploys a tag that does not exist.

## Permissions and audit

No route, permission or audit event changes. The new command runs as the owner, before the server, and only makes or updates the application role. The templates give the server only the application role, as Compose does.

## Load budget

None: no request path changes.

## Acceptance criteria

- [x] `kenwerk-backup app-role` makes the role with the decoded password, sets a new password on a second run, and refuses the owner, a role that may create roles, a member of the owner and an address that is not `postgres://` (`app-role-test.sh`)
- [x] The chart renders with `databaseInit` off without the first step, and with it on with the backup image's `app-role` at the chosen tag; `extraObjects` and ingress annotations render; it refuses no `publicUrl` and an unknown mode; three value sets pass `kubeconform -strict`
- [x] The module and both examples pass `validate` and `fmt -check` with OpenTofu 1.13.8 and Terraform 1.5.7
- [x] `main.bicep` passes `bicep lint`, and `azuredeploy.json` is its build, up to the order of `dependsOn`
- [x] `kenwerk.yaml` passes `cfn-lint` with warnings as failures
- [x] No template holds a password, key or host address of anyone
- [ ] A deployment on each cloud, end to end (needs accounts and a release: product owner)

## How the product owner tests it

1. Push the first release tag when you decide to, and make the four packages on ghcr.io public (`kenwerk`, `kenwerk-backup`, `kenwerk-collab`, `charts/kenwerk`).
2. Azure: press the button in the README, fill in a resource group and the version, wait about 15 minutes, open the address in the output, and enter the setup code from the command in the output.
3. Google Cloud: press "Open in Cloud Shell", follow the tutorial, point the domain, wait for the certificate.
4. AWS: run the command from `docs/operations/deploy-aws.md`, open the `Url` output.
5. On each: make a page with an attachment, wait for the backup in Administration, Backups, deploy the next version, and see the page again.

## Provenance

Own design, from the repository's documents. Platform facts from the public documentation of Azure Container Apps, Azure Database for PostgreSQL, Amazon ECS, RDS, EFS and CloudFront, Google Cloud Run, GKE and Cloud SQL, Helm, OpenTofu and Terraform, read 2026-11-22. Tool versions and checksums from their GitHub and HashiCorp release pages, 2026-11-22. pgx's handling of `sslrootcert=system` read from `jackc/pgx` v5.12.0, `pgconn/config.go`.
