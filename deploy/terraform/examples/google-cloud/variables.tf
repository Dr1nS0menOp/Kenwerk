# SPDX-License-Identifier: Apache-2.0

variable "project" {
  description = "The Google Cloud project to install into."
  type        = string
}

variable "region" {
  description = "Region of the cluster and the database."
  type        = string
  default     = "europe-west4"
}

variable "domain" {
  description = "The host name people will use, such as wiki.example.com. You point its A record at the output ingress_address."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.domain))
    error_message = "domain must be a host name such as wiki.example.com."
  }
}

variable "kenwerk_version" {
  description = "A released version of Kenwerk, such as v0.1.0. Its images and chart must be published."
  type        = string

  validation {
    condition     = can(regex("^v[0-9]+\\.[0-9]+\\.[0-9]+$", var.kenwerk_version))
    error_message = "kenwerk_version must look like v0.1.0."
  }
}

variable "name" {
  description = "Name of the cluster, the database instance, the namespace and the release."
  type        = string
  default     = "kenwerk"
}

variable "chart" {
  description = "The chart: the published one, or a path such as ../../../helm/kenwerk."
  type        = string
  default     = "oci://ghcr.io/dr1ns0menop/charts/kenwerk"
}

variable "database_tier" {
  description = "Machine of Cloud SQL. db-g1-small suits a trial; give a few hundred people db-custom-2-7680 (docs/operations/install.md)."
  type        = string
  default     = "db-g1-small"
}

variable "deletion_protection" {
  description = "Refuse to delete the cluster and the database. Set false before tofu destroy."
  type        = bool
  default     = true
}

variable "extra_env" {
  description = "Further settings for Kenwerk, such as KENWERK_SMTP_HOST."
  type        = map(string)
  default     = {}
}
