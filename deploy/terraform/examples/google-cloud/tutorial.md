# Kenwerk on Google Cloud

## Before you start

You need a Google Cloud project with billing on, a domain whose DNS you can change, and a released version of Kenwerk, such as `v0.1.0`. This makes Cloud SQL, a GKE Autopilot cluster and a load balancer: about 50 to 70 US dollars a month. `docs/operations/deploy-google-cloud.md` explains each part.

## Choose the project

```sh
gcloud config set project <your-project>
```

## Create everything

Cloud Shell has Terraform; OpenTofu works the same way with `tofu`.

```sh
terraform init
terraform apply -var project="$(gcloud config get-value project)" -var domain=wiki.example.com -var kenwerk_version=v0.1.0
```

Answer `yes`. It takes 15 to 25 minutes.

## Point the domain

Make an A record for the domain with the `ingress_address` from the output. The certificate becomes active within an hour.

## Make the first administrator

```sh
gcloud container clusters get-credentials kenwerk --region europe-west4
kubectl -n kenwerk logs deploy/kenwerk | grep 'first setup'
```

Open `https://<your domain>/setup` and enter the code.

## Keep the state safe

The state file in this folder holds the passwords and the encryption key. Copy it somewhere safe and encrypted before you close Cloud Shell, or move it to an encrypted bucket.
