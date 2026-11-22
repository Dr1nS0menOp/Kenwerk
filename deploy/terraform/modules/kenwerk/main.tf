# SPDX-License-Identifier: Apache-2.0
# Kenwerk on any Kubernetes cluster, against a PostgreSQL you give it (spec 099). The caller
# configures the helm and kubernetes providers for its cluster; the examples show how for
# Google Cloud and for a cluster that exists already.
#
# The secrets are generated here and kept only in the Secret and in the state: treat the state
# as secret, and keep it encrypted (OpenTofu's state encryption, or an encrypted backend).

# The application role's password. Letters and digits only, so the address needs no escaping.
resource "random_password" "app" {
  length  = 40
  special = false
}

# master.key, 32 random bytes (docs/operations/install.md, "The encryption key"). It lives in
# the Secret, apart from the data volume. Back it up: without it no stored file can be read.
resource "random_bytes" "master_key" {
  length = 32
}

locals {
  database = var.database
  # A socket folder goes in the query, as libpq and pgx both read it.
  is_socket = startswith(local.database.host, "/")
  authority = local.is_socket ? "" : "${local.database.host}:${local.database.port}"
  ca_file   = "/run/secrets/kenwerk/database-ca.pem"
  query = join("&", compact([
    "sslmode=${local.database.sslmode}",
    local.database.ca_certificate != "" ? "sslrootcert=${local.ca_file}" : "",
    local.is_socket ? "host=${local.database.host}" : "",
  ]))
  owner_url = format("postgres://%s:%s@%s/%s?%s",
    urlencode(local.database.owner_username), urlencode(local.database.owner_password),
  local.authority, local.database.name, local.query)
  app_url = format("postgres://%s:%s@%s/%s?%s",
  var.app_role, random_password.app.result, local.authority, local.database.name, local.query)

  public_host = regex("^https?://([^:/]+)", var.public_url)[0]

  values = {
    publicUrl      = var.public_url
    existingSecret = kubernetes_secret_v1.kenwerk.metadata[0].name
    image = {
      tag = var.image_tag
    }
    databaseInit = {
      enabled = var.create_app_role
      image = {
        tag = var.image_tag
      }
    }
    persistence = {
      size         = var.persistence.size
      storageClass = var.persistence.storage_class
    }
    ingress = {
      enabled     = var.ingress.enabled
      className   = var.ingress.class_name
      annotations = var.ingress.annotations
      host        = var.ingress.host != "" ? var.ingress.host : local.public_host
      tlsSecret   = var.ingress.tls_secret
    }
    trustedProxies = var.trusted_proxies
    extraEnv       = [for name, value in var.extra_env : { name = name, value = value }]
    extraObjects   = var.extra_objects
  }
}

resource "kubernetes_secret_v1" "kenwerk" {
  metadata {
    name      = var.name
    namespace = var.namespace
  }

  data = merge(
    {
      "database-url"         = local.app_url
      "migrate-database-url" = local.owner_url
    },
    local.database.ca_certificate != "" ? { "database-ca.pem" = local.database.ca_certificate } : {},
  )

  binary_data = {
    "master-key" = random_bytes.master_key.base64
  }
}

resource "helm_release" "kenwerk" {
  name      = var.name
  namespace = var.namespace
  chart     = var.chart
  version   = startswith(var.chart, "oci://") ? var.chart_version : null
  values    = [yamlencode(local.values)]

  # The first start makes the tables; a slow database is not a failed install.
  timeout = 900
  wait    = true
}
