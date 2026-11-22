# SPDX-License-Identifier: Apache-2.0
# Works with OpenTofu 1.6 and later and with Terraform 1.5 and later (spec 099). CI validates
# it with both CLIs at the versions scripts/deploy-check.sh pins.
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
