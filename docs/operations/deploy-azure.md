# Kenwerk on Azure

Written for: someone with an Azure subscription who wants Kenwerk running without a server of their own. Spec 099 holds the reasons behind each choice.

> **Status: the template is checked with Bicep in CI, but has not been deployed on Azure yet.** It needs a published release: the button works once a release tag is pushed and its images on ghcr.io are public. Try it in a scratch resource group first.

## What it makes

One resource group with:

- **A private network**, with a subnet for the apps and one for the database.
- **Azure Database for PostgreSQL**, flexible server, version 16, Burstable B1ms with 32 GB, reachable only from the network. Its own backups allow a restore to any minute of the last 7 days (up to 35). `pg_trgm` is allowed, which search needs.
- **A storage account** with three file shares, reachable only from the apps' subnet: `data` (stored files and `master.key`, like the data volume of Compose), `backups` (what the backup service writes) and `keys` (the backup key, apart from the backups it opens).
- **A Container Apps environment** in the network, and **one app with one replica**:
  - a first step that makes the backup key once and the database role of the application (`kenwerk-backup app-role`);
  - the **server**, which holds only the application role;
  - the **backup service** of Compose, which migrates, signs the audit checkpoints and makes an encrypted backup every 4 hours, keeping 42.

The address is `https://<name>.<something>.<region>.azurecontainerapps.io`, with Azure's certificate.

## Deploy

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FDr1nS0menOp%2FKenwerk%2Fmain%2Fdeploy%2Fazure%2Fazuredeploy.json)

1. Press the button, pick or create a resource group and a region.
2. Fill in **Kenwerk Version**, a released version such as `v0.1.0` (see the releases of the repository). Leave the two passwords as they are: each deployment generates new ones.
3. Create. It takes about 15 minutes, most of it the database.
4. Under **Outputs**, open `url`, add `/setup`, and enter the code from the log. The command in `setupCodeCommand` prints it:

   ```sh
   az containerapp logs show --name kenwerk --resource-group <group> --container kenwerk --tail 300 | grep "first setup"
   ```

The same from the command line, with the Azure CLI:

```sh
az group create --name kenwerk --location westeurope
az deployment group create --resource-group kenwerk \
  --template-file deploy/azure/main.bicep --parameters kenwerkVersion=v0.1.0
```

## Secrets

No secret is in the template. Both database passwords are random at every deployment and set on the database and in the app together, as Container Apps secrets that the containers read as files; the server can read only its own. The backup key is made by the first start on the `keys` share and stays there across deployments. **Copy it to a password safe now**: without it no backup can be restored. In the portal: storage account, File shares, `keys`, `backup.key`.

`master.key` lives on the `data` share, as in Compose, because the backup service encrypts it into each backup. Every copy of that share therefore carries the key that opens the files: keep its snapshots as carefully as the key.

## Your own domain

In the portal: the container app, Custom domains, Add, with a free managed certificate. Then set the address Kenwerk uses, and restart:

```sh
az containerapp update --name kenwerk --resource-group <group> --container-name kenwerk \
  --set-env-vars KENWERK_PUBLIC_URL=https://wiki.example.com
```

Passkeys are bound to the address: set the domain before people register them.

## Mail and other settings

Every setting of [install.md](install.md) is an environment variable of the `kenwerk` container. Add them the same way, such as `KENWERK_SMTP_HOST` and `KENWERK_SMTP_FROM`. A password goes in a secret: `az containerapp secret set`, then `--set-env-vars KENWERK_SMTP_PASSWORD=secretref:smtp-password`.

## Backups and restore

- The backup service makes an encrypted backup every 4 hours into the `backups` share and notes it, so upgrades find a recent backup. Administration, Backups shows them.
- The database keeps its own backups for a restore to any minute (portal: the server, Restore). That restores the database only, into a new server.
- To restore one of Kenwerk's own backups, copy the share and the key to a machine with Docker and follow [backup-restore.md](backup-restore.md) with `scripts/restore.sh`.
- Deleted files on the shares are kept 14 days.

## Upgrade

Deploy the template again with the new version (the button, or the `az deployment group create` above). It sets new passwords on both sides, starts the new revision, and the backup service runs the migrations after a backup. Or change only the images:

```sh
az containerapp update --name kenwerk --resource-group <group> \
  --container-name kenwerk --image ghcr.io/dr1ns0menop/kenwerk:v0.2.0
```

and the same for the `backup` container and the `prepare` step with `kenwerk-backup:v0.2.0`. Keep the two images at the same version. Read [upgrade.md](upgrade.md) first.

## Limits of this layout

- **One replica.** The template allows one, as Kenwerk is sized for one node.
- **The embedded queue lives on the replica's own disk.** Container Apps starts a new revision before it stops the old one, and two queues may never share files. Events handed to the old replica's queue and not yet handled when it stops are lost: at worst a notification.
- **Files on Azure Files (SMB).** Not yet tried with Kenwerk's file handling; the backup service changes the owner of each backup, which SMB may ignore.
- **Client addresses** are believed from the apps' subnet, where the platform's proxy is.

## What it costs

Roughly, at list prices for the defaults, in US dollars a month: the app 40 to 55 (0.75 vCPU and 1.5 GiB, always on), the database 15 to 20, the files and logs a few. **About 60 to 80 in all.** Check with the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/).

## Remove it

```sh
az group delete --name <group>
```

This removes everything, including the database's own backups. Copy the `backups` and `keys` shares first if you may want the wiki back.
