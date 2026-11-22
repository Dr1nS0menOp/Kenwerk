# SPDX-License-Identifier: Apache-2.0

output "public_url" {
  description = "The address of the wiki. Open /setup there with the code from the server's log."
  value       = var.public_url
}

output "secret_name" {
  description = "The Secret with both database addresses and master.key. Copy master-key to a password safe."
  value       = kubernetes_secret_v1.kenwerk.metadata[0].name
}

output "setup_code_command" {
  description = "Prints the line of the log with the one-time setup code."
  value       = "kubectl -n ${var.namespace} logs deploy/${var.name} | grep 'first setup'"
}
