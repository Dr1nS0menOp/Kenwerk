# SPDX-License-Identifier: Apache-2.0
# Kenwerk on Google Cloud (spec 099): a GKE Autopilot cluster, Cloud SQL for PostgreSQL 16 on a
# private address, and the Helm chart through the module, behind Google's load balancer with a
# Google-managed certificate for your domain. See docs/operations/deploy-google-cloud.md.
#
#   tofu init && tofu apply -var project=my-project -var domain=wiki.example.com -var kenwerk_version=v0.1.0
#
# Then point the domain's A record at the output ingress_address. The certificate follows
# within an hour of that.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

locals {
  name       = var.name
  public_url = "https://${var.domain}"
  # Google's front ends reach the pods from these ranges, and add the load balancer's own
  # address to X-Forwarded-For after the client's.
  google_front_ends = "130.211.0.0/22,35.191.0.0/16"
}

resource "google_project_service" "used" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# --- Network: the cluster and the database share one private network. -----------------------

resource "google_compute_network" "kenwerk" {
  name                    = local.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.used]
}

resource "google_compute_subnetwork" "kenwerk" {
  name                     = local.name
  network                  = google_compute_network.kenwerk.id
  region                   = var.region
  ip_cidr_range            = "10.10.0.0/20"
  private_ip_google_access = true
}

# Cloud SQL gets a private address through private services access: no public address at all.
resource "google_compute_global_address" "sql_range" {
  name          = "${local.name}-sql"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.kenwerk.id
}

resource "google_service_networking_connection" "sql" {
  network                 = google_compute_network.kenwerk.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql_range.name]
}

# --- Database ---------------------------------------------------------------------------------

resource "random_password" "owner" {
  length  = 40
  special = false
}

resource "google_sql_database_instance" "kenwerk" {
  name                = local.name
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = var.deletion_protection

  settings {
    edition           = "ENTERPRISE"
    tier              = var.database_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 20
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.kenwerk.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Daily backups kept a week, and the log in between, to restore to any minute.
    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day  = 7
      hour = 3
    }
  }

  depends_on = [google_service_networking_connection.sql]
}

resource "google_sql_database" "kenwerk" {
  name     = "kenwerk"
  instance = google_sql_database_instance.kenwerk.name
}

# The owner of the tables. Cloud SQL makes it a member of cloudsqlsuperuser, so it may create
# the application role, which the chart's first step does (spec 099).
resource "google_sql_user" "owner" {
  name     = "kenwerk_owner"
  instance = google_sql_database_instance.kenwerk.name
  password = random_password.owner.result
}

# --- Cluster ----------------------------------------------------------------------------------

resource "google_container_cluster" "kenwerk" {
  name                = local.name
  location            = var.region
  enable_autopilot    = true
  network             = google_compute_network.kenwerk.id
  subnetwork          = google_compute_subnetwork.kenwerk.id
  deletion_protection = var.deletion_protection

  ip_allocation_policy {}

  release_channel {
    channel = "REGULAR"
  }

  depends_on = [google_project_service.used]
}

# The address the domain points at.
resource "google_compute_global_address" "ingress" {
  name       = "${local.name}-ingress"
  depends_on = [google_project_service.used]
}

data "google_client_config" "current" {}

provider "kubernetes" {
  host                   = "https://${google_container_cluster.kenwerk.endpoint}"
  token                  = data.google_client_config.current.access_token
  cluster_ca_certificate = base64decode(google_container_cluster.kenwerk.master_auth[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes = {
    host                   = "https://${google_container_cluster.kenwerk.endpoint}"
    token                  = data.google_client_config.current.access_token
    cluster_ca_certificate = base64decode(google_container_cluster.kenwerk.master_auth[0].cluster_ca_certificate)
  }
}

resource "kubernetes_namespace_v1" "kenwerk" {
  metadata {
    name = local.name
  }
}

module "kenwerk" {
  source = "../../modules/kenwerk"

  name          = local.name
  namespace     = kubernetes_namespace_v1.kenwerk.metadata[0].name
  public_url    = local.public_url
  chart         = var.chart
  chart_version = trimprefix(var.kenwerk_version, "v")
  image_tag     = var.kenwerk_version

  # verify-ca: Cloud SQL's certificate names the instance, not its address, and comes from a
  # CA of this instance alone, so checking the CA is what proves the server.
  database = {
    host           = google_sql_database_instance.kenwerk.private_ip_address
    name           = google_sql_database.kenwerk.name
    owner_username = google_sql_user.owner.name
    owner_password = random_password.owner.result
    sslmode        = "verify-ca"
    ca_certificate = google_sql_database_instance.kenwerk.server_ca_cert[0].cert
  }

  ingress = {
    enabled    = true
    class_name = "gce"
    annotations = {
      "kubernetes.io/ingress.global-static-ip-name" = google_compute_global_address.ingress.name
      "networking.gke.io/managed-certificates"      = "${local.name}-certificate"
      "networking.gke.io/v1beta1.FrontendConfig"    = "${local.name}-https"
    }
  }

  trusted_proxies = "${local.google_front_ends},${google_compute_global_address.ingress.address}/32"
  extra_env       = var.extra_env

  extra_objects = [
    yamlencode({
      apiVersion = "networking.gke.io/v1"
      kind       = "ManagedCertificate"
      metadata   = { name = "${local.name}-certificate" }
      spec       = { domains = [var.domain] }
    }),
    # Plain http only answers with a redirect to https.
    yamlencode({
      apiVersion = "networking.gke.io/v1beta1"
      kind       = "FrontendConfig"
      metadata   = { name = "${local.name}-https" }
      spec       = { redirectToHttps = { enabled = true } }
    }),
  ]

  depends_on = [google_sql_user.owner, google_sql_database.kenwerk]
}
