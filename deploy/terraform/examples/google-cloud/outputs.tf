# SPDX-License-Identifier: Apache-2.0

output "ingress_address" {
  description = "Point the A record of your domain at this address."
  value       = google_compute_global_address.ingress.address
}

output "public_url" {
  description = "The address of the wiki, once the certificate is active."
  value       = module.kenwerk.public_url
}

output "setup_code_command" {
  description = "Prints the line with the one-time setup code. First run: gcloud container clusters get-credentials kenwerk --region <region>"
  value       = module.kenwerk.setup_code_command
}
