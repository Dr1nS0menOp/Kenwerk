# SPDX-License-Identifier: Apache-2.0

variable "name" {
  description = "Name of the Helm release, and of the Secret it reads."
  type        = string
  default     = "kenwerk"
}

variable "namespace" {
  description = "Kubernetes namespace to install into. It must exist."
  type        = string
}

variable "public_url" {
  description = "The address people type in their browser, such as https://wiki.example.com. A host name, not an IP address, and https in production."
  type        = string

  validation {
    condition     = can(regex("^https?://[A-Za-z0-9.-]+(:[0-9]+)?$", var.public_url))
    error_message = "public_url must look like https://wiki.example.com, without a path."
  }
}

variable "chart" {
  description = "The chart: the published one by default, or a path such as ../../../helm/kenwerk."
  type        = string
  default     = "oci://ghcr.io/dr1ns0menop/charts/kenwerk"
}

variable "chart_version" {
  description = "Version of the published chart, such as 0.1.0, the release without its v. Ignored for a chart path."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Tag of the kenwerk and kenwerk-backup images, such as v0.1.0. Empty = the chart's appVersion."
  type        = string
  default     = ""
}

variable "database" {
  description = <<-EOT
    The PostgreSQL 16 or later that Kenwerk uses. owner_username and owner_password are a role
    that owns the database or may create in it, and may create roles: it runs the migrations,
    and makes the application role (spec 099). host is a name or address, or a socket folder
    starting with /. sslmode is verify-full or verify-ca for a database on another machine;
    ca_certificate is the server's CA in PEM, empty to trust the system's roots.
  EOT
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

  validation {
    condition     = contains(["disable", "require", "verify-ca", "verify-full"], var.database.sslmode)
    error_message = "database.sslmode must be disable, require, verify-ca or verify-full."
  }
}

variable "app_role" {
  description = "Name of the application role, which owns nothing. The module gives it a generated password."
  type        = string
  default     = "kenwerk_app"

  validation {
    condition     = can(regex("^[a-z_][a-z0-9_]{0,62}$", var.app_role))
    error_message = "app_role must be a lower-case PostgreSQL name."
  }
}

variable "create_app_role" {
  description = "Make the application role before each start, as the owner. Turn off when your database team makes it."
  type        = bool
  default     = true
}

variable "persistence" {
  description = "The volume for stored files and the embedded queue."
  type = object({
    size          = optional(string, "20Gi")
    storage_class = optional(string, "")
  })
  default = {}
}

variable "ingress" {
  description = "The Ingress in front of Kenwerk. host defaults to the host of public_url."
  type = object({
    enabled     = optional(bool, false)
    class_name  = optional(string, "")
    annotations = optional(map(string), {})
    host        = optional(string, "")
    tls_secret  = optional(string, "")
  })
  default = {}
}

variable "trusted_proxies" {
  description = "Address ranges of the load balancer or proxy whose X-Forwarded-For is believed, comma-separated."
  type        = string
  default     = ""
}

variable "extra_env" {
  description = "Further settings for Kenwerk, such as KENWERK_SMTP_HOST, as name and value."
  type        = map(string)
  default     = {}
}

variable "extra_objects" {
  description = "Further Kubernetes objects to install with the chart, such as a cloud's certificate, each as YAML (yamlencode)."
  type        = list(string)
  default     = []
}
