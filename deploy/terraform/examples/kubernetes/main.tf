# SPDX-License-Identifier: Apache-2.0
# Kenwerk on a Kubernetes cluster you have, against a PostgreSQL you have (spec 099). Any cloud
# or none: the module needs only the cluster and the database. See
# docs/operations/deploy-kubernetes.md.
#
#   tofu init && tofu apply -var-file=kenwerk.tfvars

terraform {
  required_version = ">= 1.5.0"

  required_providers {
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

variable "kubeconfig" {
  description = "Path of the kubeconfig file of the cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "public_url" {
  description = "The address people will use, such as https://wiki.example.com."
  type        = string
}

variable "kenwerk_version" {
  description = "A released version of Kenwerk, such as v0.1.0."
  type        = string
}

variable "database" {
  description = "The database: see the module's variable of the same name."
  type = object({
    host           = string
    port           = optional(number, 5432)
    name           = optional(string, "kenwerk")
    owner_username = string
    owner_password = string
    sslmode        = optional(string, "verify-full")
    ca_certificate = optional(string, "")
  })
  sensitive = true
}

variable "ingress_class" {
  description = "Class of the cluster's Ingress controller, such as nginx or traefik."
  type        = string
  default     = ""
}

variable "tls_secret" {
  description = "Secret with the certificate of the host, made by you or by cert-manager."
  type        = string
  default     = ""
}

variable "trusted_proxies" {
  description = "Address ranges of the Ingress controller's pods, whose X-Forwarded-For is believed."
  type        = string
  default     = ""
}

provider "kubernetes" {
  config_path = var.kubeconfig
}

provider "helm" {
  kubernetes = {
    config_path = var.kubeconfig
  }
}

resource "kubernetes_namespace_v1" "kenwerk" {
  metadata {
    name = "kenwerk"
  }
}

module "kenwerk" {
  source = "../../modules/kenwerk"

  namespace       = kubernetes_namespace_v1.kenwerk.metadata[0].name
  public_url      = var.public_url
  chart_version   = trimprefix(var.kenwerk_version, "v")
  image_tag       = var.kenwerk_version
  database        = var.database
  trusted_proxies = var.trusted_proxies

  ingress = {
    enabled    = true
    class_name = var.ingress_class
    tls_secret = var.tls_secret
  }
}

output "public_url" {
  value = module.kenwerk.public_url
}

output "setup_code_command" {
  value = module.kenwerk.setup_code_command
}
