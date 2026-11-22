# Kenwerk on Google Cloud

Written for: someone with a Google Cloud project and a domain who wants Kenwerk running without a server of their own. Spec 099 holds the reasons behind each choice.

> **Status: the example is checked with OpenTofu and Terraform in CI, but has not been applied on Google Cloud yet.** It needs a published release whose images and chart on ghcr.io are public. Try it in a scratch project first.

## What it makes

`deploy/terraform/examples/google-cloud`, with OpenTofu or Terraform:

- **A private network**, and **Cloud SQL for PostgreSQL 16** on a private address only, TLS only, with daily backups kept 7 and point-in-time recovery for 7 days.
- **A GKE Autopilot cluster**, and in it, through the module of [deploy-kubernetes.md](deploy-kubernetes.md), the **Helm chart** with one pod: a first step that makes the database role of the application (`kenwerk-backup app-role`), then the server, which migrates as the owner, as the chart always does.
- **Google's load balancer** on a global address, a **Google-managed certificate** for your domain, and http redirected to https.

Cloud Run is not used yet: it has no step that runs before the server, and its volumes do not suit the embedded queue.

## Deploy

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https%3A%2F%2Fgithub.com%2FDr1nS0menOp%2FKenwerk&cloudshell_workspace=deploy%2Fterraform%2Fexamples%2Fgoogle-cloud&cloudshell_tutorial=tutorial.md)

The button opens this repository in Cloud Shell, with a tutorial of the steps below. On your own machine you need `gcloud` and OpenTofu (or Terraform):

```sh
gcloud auth application-default login
cd deploy/terraform/examples/google-cloud
tofu init
tofu apply -var project=my-project -var domain=wiki.example.com -var kenwerk_version=v0.1.0
```

It takes 15 to 25 minutes. Then:

1. Point the A record of the domain at the `ingress_address` output. The certificate becomes active within an hour of that; until then the browser warns.
2. `gcloud container clusters get-credentials kenwerk --region europe-west4`, then run `setup_code_command` from the outputs for the setup code, and open `https://<domain>/setup`.

## Secrets and the state

OpenTofu generates the owner's and the application's passwords and `master.key`, and keeps them in the Secret and **in the state file**. Treat the state as a secret: keep it in an encrypted bucket, or use OpenTofu's state encryption. Copy `master.key` to a password safe:

```sh
kubectl -n kenwerk get secret kenwerk -o jsonpath='{.data.master-key}' > master.key.base64
```

The database is reached with `sslmode=verify-ca` and the instance's own CA, which the example reads from Cloud SQL.

## Backups

- Cloud SQL backs up daily and restores to any minute of the last 7 days.
- Stored files are on the pod's persistent disk: snapshot it (a VolumeSnapshot, or the disk in Compute Engine).
- **An upgrade waits for a recent noted backup** (ADR-040). Before one, make an on-demand backup, then note it:

  ```sh
  gcloud sql backups create --instance kenwerk
  kubectl -n kenwerk exec deploy/kenwerk -- kenwerk backup note
  ```

## Mail and other settings

`-var 'extra_env={KENWERK_SMTP_HOST="smtp.example.com",KENWERK_SMTP_FROM="wiki@example.com"}'`. Every setting is in [install.md](install.md).

## Upgrade

`tofu apply` with the new `kenwerk_version`, after the backup above. The pod is replaced, not doubled. Read [upgrade.md](upgrade.md) first.

## What it costs

Roughly, at list prices for the defaults, in US dollars a month: Cloud SQL db-g1-small about 25, the pod about 20, the load balancer about 18; Google's free tier covers the fee of one Autopilot cluster. **About 50 to 70 in all.** Check with the [Google Cloud pricing calculator](https://cloud.google.com/products/calculator).

## Remove it

```sh
tofu apply -var deletion_protection=false -var project=... -var domain=... -var kenwerk_version=...
tofu destroy -var project=... -var domain=... -var kenwerk_version=...
```

This removes the database and its backups too.
