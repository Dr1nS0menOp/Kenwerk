# Kenwerk on Kubernetes: the Helm chart and the Terraform module

Written for: operators with a Kubernetes cluster and a PostgreSQL. Spec 099 holds the reasons behind each choice. [install.md](install.md#kubernetes) describes the chart's two modes.

> **Status: the chart and the module are checked in CI (helm lint, helm template, kubeconform; OpenTofu and Terraform validate), not yet on a cluster.** The published chart and images exist from the first release on.

## The chart from its repository

Each release publishes the chart on ghcr.io, as an OCI artifact signed like the images:

```sh
helm install wiki oci://ghcr.io/dr1ns0menop/charts/kenwerk --version 0.1.0 \
  --set publicUrl=https://wiki.example.com --set databaseInit.enabled=true
```

The chart's version is the release without its `v`; it pulls the images of that release. Check the signature with `cosign verify ghcr.io/dr1ns0menop/charts/kenwerk:0.1.0` and the identity options of [install.md](install.md#checking-what-you-downloaded).

The chart holds no secret. It reads a Secret, `kenwerk` by default, with:

| Key | Holds |
|---|---|
| `database-url` | The application role, such as `postgres://kenwerk_app:...@db:5432/kenwerk?sslmode=verify-full` |
| `migrate-database-url` | The owner of the tables, which migrates |
| `master-key` | 32 random bytes: `head -c 32 /dev/urandom > master-key` |
| `metrics-token` | Optional: turns on `/metrics` |

```sh
kubectl create secret generic kenwerk --from-literal=database-url=... \
  --from-literal=migrate-database-url=... --from-file=master-key=master-key
```

**`databaseInit.enabled=true`** makes the application role before each start, as the owner: for a managed database, where no script runs when it is made. It refuses a role that is the owner or holds more rights than it needs. Leave it off when your database team makes the role, as `deploy/install-lxc.sh` does.

Other values: `ingress.annotations` for a cloud's load balancer, `extraObjects` for its own resources such as a certificate, `extraEnv` for any setting of [install.md](install.md).

## The Terraform and OpenTofu module

`deploy/terraform/modules/kenwerk` does the above for you: it generates the application's password and `master.key`, writes the Secret, and installs the chart with `databaseInit` on. It uses only the `helm`, `kubernetes` and `random` providers, so it works on any cluster; you configure those providers for yours. It works with OpenTofu 1.6 and later and with Terraform 1.5 and later.

```hcl
module "kenwerk" {
  source        = "github.com/Dr1nS0menOp/Kenwerk//deploy/terraform/modules/kenwerk?ref=v0.1.0"
  namespace     = "kenwerk"
  public_url    = "https://wiki.example.com"
  chart_version = "0.1.0"
  image_tag     = "v0.1.0"
  database = {
    host           = "db.example.com"
    owner_username = "kenwerk_owner"
    owner_password = var.owner_password
    sslmode        = "verify-full"
  }
  ingress = { enabled = true, class_name = "nginx", tls_secret = "wiki-tls" }
}
```

Two examples:

- `examples/kubernetes`: a cluster and a database you have.
- `examples/google-cloud`: everything on Google Cloud, see [deploy-google-cloud.md](deploy-google-cloud.md).

**The state holds the secrets**: both passwords and `master.key`. Keep it encrypted, with OpenTofu's state encryption or an encrypted backend, and copy `master.key` to a password safe. A `tofu destroy` deletes the Secret, and the key with it.

## Backups and upgrades

The chart runs no backup service: back up the database with its platform, and the volume with snapshots. An upgrade waits for a backup noted in the last 24 hours (ADR-040): after a backup, run `kubectl exec deploy/<release> -- kenwerk backup note`. See [upgrade.md](upgrade.md).
