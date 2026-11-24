#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Checks every way to deploy Kenwerk without a cloud account (spec 099): the Helm chart with
# helm lint, helm template and kubeconform; the Terraform module and its examples with
# OpenTofu and with Terraform; the Azure template with Bicep, and that azuredeploy.json is
# the build of main.bicep; the AWS template with cfn-lint; and the step that makes the
# application role, against a real PostgreSQL.
#
#   bash scripts/deploy-check.sh          everything
#   bash scripts/deploy-check.sh helm     one part: helm, terraform, azure, aws or app-role
#   bash scripts/deploy-check.sh --write-azure
#                                          rebuild deploy/azure/azuredeploy.json from main.bicep
#
# Runs on a Linux amd64 host with Docker, curl, tar and python3, as CI's runner has. Every
# tool is pinned by version and checked against its sha256 before it runs; they are kept in
# bin/deploy-tools, which git ignores. docs/dependencies.md lists them and their licences.
set -eu
cd "$(dirname "$0")/.."
root=$PWD
tools=$root/bin/deploy-tools
mkdir -p "$tools"

HELM_VERSION=v4.3.2
HELM_SHA256=d1c0278d46beab79582d7e50f5b3dc206944ba8e577cde618513fd07daa53983
KUBECONFORM_VERSION=v0.8.0
KUBECONFORM_SHA256=9bc2bffbf71f261128533edaf912153948b7ff238f9a531ae6d34466ec287883
TOFU_VERSION=1.13.8
TOFU_SHA256=dab8135df87343ce143e1bef1a6174d7b82035950818bde17950658ff9a72697
# The last Terraform under MPL-2.0; later ones are BUSL-1.1 (docs/dependencies.md).
TERRAFORM_VERSION=1.5.7
TERRAFORM_SHA256=c0ed7bc32ee52ae255af9982c8c88a7a4c610485cf1d55feeb037eab75fa082c
BICEP_VERSION=v0.48.1
BICEP_SHA256=b09ec25a9d376c1f8e33ede6ed22b587f915ad68488d5db77a6f9541748c7f6e
# cfn-lint runs in this image, from the hash-pinned list in scripts/deploy-check/cfn-lint.txt.
PYTHON_IMAGE=python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
# The same PostgreSQL as compose.yaml, which is also the base of the backup image.
POSTGRES_IMAGE=postgres:16@sha256:3950ad7c3148ca2175ef1b6c36c9efbf78957ae8fbe8b3a5d7c35af50500382f
# The Kubernetes release whose schemas the chart's objects must match.
KUBERNETES_VERSION=1.33.0

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}
step() { printf '\n== %s\n' "$*"; }

# fetch downloads url to file in the tool folder once, and refuses it unless its sha256 is sha.
fetch() {
  local file=$tools/$1 url=$2 sha=$3
  if [ ! -s "$file" ]; then
    curl -fsSL --retry 3 -o "$file.part" "$url" || { echo "could not download $url" >&2; return 1; }
    mv "$file.part" "$file"
  fi
  if ! echo "$sha  $file" | sha256sum -c --quiet -; then
    rm -f "$file"
    echo "$1 does not have the pinned sha256: refused" >&2
    return 1
  fi
}

helm_tool() {
  fetch helm.tar.gz "https://get.helm.sh/helm-$HELM_VERSION-linux-amd64.tar.gz" "$HELM_SHA256"
  tar -xzf "$tools/helm.tar.gz" -C "$tools" --strip-components=1 linux-amd64/helm
  fetch kubeconform.tar.gz \
    "https://github.com/yannh/kubeconform/releases/download/$KUBECONFORM_VERSION/kubeconform-linux-amd64.tar.gz" \
    "$KUBECONFORM_SHA256"
  tar -xzf "$tools/kubeconform.tar.gz" -C "$tools" kubeconform
}

# render prints the chart with publicUrl set and the given values files.
render() {
  "$tools/helm" template wiki deploy/helm/kenwerk --set publicUrl=https://wiki.example.com "$@"
}

check_helm() {
  step "Helm chart: lint, template, kubeconform"
  helm_tool
  local values out
  "$tools/helm" lint --strict deploy/helm/kenwerk --set publicUrl=https://wiki.example.com || fail "helm lint"
  for values in deploy/helm/kenwerk/ci/*.yaml; do
    "$tools/helm" lint --strict deploy/helm/kenwerk -f "$values" || fail "helm lint with $values"
    # The kinds of a cloud's own resources have no schema in kubeconform's set.
    render -f "$values" |
      "$tools/kubeconform" -strict -summary -kubernetes-version "$KUBERNETES_VERSION" \
        -skip ManagedCertificate,FrontendConfig - || fail "kubeconform with $values"
  done

  # What the chart promises, as rendered.
  out=$(render)
  grep -q 'name: database-role' <<<"$out" && fail "the step that makes the role runs without databaseInit"
  grep -q 'image: "ghcr.io/dr1ns0menop/kenwerk:v' <<<"$out" || fail "the default image is not the published one at the chart's appVersion"
  out=$(render -f deploy/helm/kenwerk/ci/managed-database.yaml)
  grep -q 'name: database-role' <<<"$out" || fail "databaseInit does not add the step that makes the role"
  grep -q 'image: "ghcr.io/dr1ns0menop/kenwerk-backup:v1.2.3"' <<<"$out" || fail "the step does not run the backup image of the chosen tag"
  grep -q 'args: \[app-role\]' <<<"$out" || fail "the step does not run app-role"
  grep -q 'kind: ManagedCertificate' <<<"$out" || fail "extraObjects are not installed"
  grep -q 'networking.gke.io/managed-certificates: wiki-certificate' <<<"$out" || fail "ingress annotations are not set"
  if render --set publicUrl= >/dev/null 2>&1; then fail "the chart renders without publicUrl"; fi
  if render --set mode=other >/dev/null 2>&1; then fail "the chart renders an unknown mode"; fi
}

# tf_check validates every module and example with one CLI, in a copy, so nothing is written
# into the checkout.
tf_check() {
  local cli=$1 work dir
  work=$(mktemp -d)
  cp -r deploy/terraform "$work/terraform"
  "$cli" fmt -check -recursive -diff "$work/terraform" || fail "$(basename "$cli") fmt"
  for dir in "$work"/terraform/modules/* "$work"/terraform/examples/*; do
    echo "-- $(basename "$cli") validate ${dir#"$work"/}"
    if "$cli" -chdir="$dir" init -backend=false -input=false -no-color >/dev/null; then
      "$cli" -chdir="$dir" validate -no-color || fail "$(basename "$cli") validate ${dir#"$work"/}"
    else
      fail "$(basename "$cli") init ${dir#"$work"/}"
    fi
  done
  rm -rf "$work"
}

check_terraform() {
  step "Terraform module and examples: OpenTofu $TOFU_VERSION and Terraform $TERRAFORM_VERSION"
  fetch tofu.tar.gz \
    "https://github.com/opentofu/opentofu/releases/download/v$TOFU_VERSION/tofu_${TOFU_VERSION}_linux_amd64.tar.gz" \
    "$TOFU_SHA256"
  tar -xzf "$tools/tofu.tar.gz" -C "$tools" tofu
  fetch terraform.zip \
    "https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
    "$TERRAFORM_SHA256"
  python3 -m zipfile -e "$tools/terraform.zip" "$tools/" && chmod +x "$tools/terraform"
  tf_check "$tools/tofu"
  tf_check "$tools/terraform"
}

bicep_tool() {
  fetch bicep "https://github.com/Azure/bicep/releases/download/$BICEP_VERSION/bicep-linux-x64" "$BICEP_SHA256"
  chmod +x "$tools/bicep"
  # Bicep is a .NET program; this spares the host the ICU libraries.
  export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
}

check_azure() {
  step "Azure: Bicep $BICEP_VERSION"
  bicep_tool
  local built
  built=$(mktemp -d)
  "$tools/bicep" lint deploy/azure/main.bicep || fail "bicep lint"
  if "$tools/bicep" build deploy/azure/main.bicep --outfile "$built/azuredeploy.json"; then
    # The button deploys the JSON, so it must be what main.bicep builds to. Compared as
    # templates, because Bicep's order of dependsOn changes from run to run.
    python3 -I scripts/deploy-check/same-arm.py "$built/azuredeploy.json" deploy/azure/azuredeploy.json ||
      fail "deploy/azure/azuredeploy.json is not the build of main.bicep: run bash scripts/deploy-check.sh --write-azure"
  else
    fail "bicep build"
  fi
  rm -rf "$built"
}

check_aws() {
  step "AWS: cfn-lint"
  docker run --rm -v "$root/deploy/aws:/templates:ro" -v "$root/scripts/deploy-check:/check:ro" "$PYTHON_IMAGE" sh -c '
    pip install -q --root-user-action=ignore --disable-pip-version-check --no-deps --require-hashes -r /check/cfn-lint.txt &&
    cfn-lint --non-zero-exit-code warning /templates/*.yaml' || fail "cfn-lint"
}

check_app_role() {
  step "The step that makes the application role, against PostgreSQL"
  POSTGRES_IMAGE=$POSTGRES_IMAGE bash scripts/deploy-check/app-role-test.sh || fail "app-role"
}

case "${1:-all}" in
  --write-azure)
    bicep_tool
    "$tools/bicep" build deploy/azure/main.bicep --outfile deploy/azure/azuredeploy.json
    exit 0
    ;;
  helm) check_helm ;;
  terraform) check_terraform ;;
  azure) check_azure ;;
  aws) check_aws ;;
  app-role) check_app_role ;;
  all)
    check_helm
    check_terraform
    check_azure
    check_aws
    check_app_role
    ;;
  *)
    echo "usage: deploy-check.sh [all|helm|terraform|azure|aws|app-role|--write-azure]" >&2
    exit 2
    ;;
esac

if [ "$failures" -gt 0 ]; then
  echo "deploy check: $failures failure(s)" >&2
  exit 1
fi
echo "deploy check passed"
