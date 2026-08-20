#!/usr/bin/env bash
set -euo pipefail

# ProofFleet Google Cloud bootstrap.
#
# Safety contract:
# - default mode is read-only/dry-run;
# - mutations require an explicit --apply flag;
# - no service-account JSON key is ever created or accepted;
# - GitHub OIDC/WIF admission is restricted to exactly OuroborosCollective/Prooffleet;
# - the bootstrap grants only the provider permissions needed by the current
#   live-proof lane: Cloud Run readback + Firestore read/write;
# - Firestore database creation is intentionally NOT automated because database
#   location is an architectural choice that should not be made implicitly.

GITHUB_REPO="OuroborosCollective/Prooffleet"
POOL_ID="prooffleet-github"
PROVIDER_ID="prooffleet-repo"
SERVICE_ACCOUNT_ID="prooffleet-github"
COLLECTION="prooffleet-live-proofs"
PROJECT_ID=""
REGION=""
CLOUD_RUN_SERVICE=""
APPLY=false

usage() {
  cat <<'EOF'
Usage:
  scripts/bootstrap-gcp-wif.sh \
    --project-id <gcp-project-id> \
    --region <cloud-run-region> \
    --cloud-run-service <service-name> \
    [--collection <firestore-collection>] \
    [--apply]

Without --apply the script performs read-only discovery and prints the exact
resources it would create. It never creates or uses a long-lived service-account
JSON key.
EOF
}

while (($#)); do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"; shift 2 ;;
    --region)
      REGION="${2:-}"; shift 2 ;;
    --cloud-run-service)
      CLOUD_RUN_SERVICE="${2:-}"; shift 2 ;;
    --collection)
      COLLECTION="${2:-}"; shift 2 ;;
    --apply)
      APPLY=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

if [[ -z "$PROJECT_ID" || -z "$REGION" || -z "$CLOUD_RUN_SERVICE" ]]; then
  echo "--project-id, --region and --cloud-run-service are required." >&2
  usage >&2
  exit 2
fi

if [[ ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Malformed Google Cloud project ID: $PROJECT_ID" >&2
  exit 2
fi
if [[ ! "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]]; then
  echo "Malformed Google Cloud region: $REGION" >&2
  exit 2
fi
if [[ ! "$CLOUD_RUN_SERVICE" =~ ^[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]]; then
  echo "Malformed Cloud Run service name: $CLOUD_RUN_SERVICE" >&2
  exit 2
fi
if [[ ! "$COLLECTION" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
  echo "Malformed Firestore collection name: $COLLECTION" >&2
  exit 2
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required. Run this script from Google Cloud Shell or a configured gcloud environment." >&2
  exit 2
}

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ ! "$PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve a numeric project number for $PROJECT_ID." >&2
  exit 2
fi

SA_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
EXPECTED_PROVIDER_NAME="${POOL_NAME}/providers/${PROVIDER_ID}"
PRINCIPAL_SET="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"
EXPECTED_ISSUER="https://token.actions.githubusercontent.com"
EXPECTED_CONDITION="assertion.repository == '${GITHUB_REPO}'"

log() { printf '[proofleet-gcp] %s\n' "$*"; }

apply_or_plan() {
  if $APPLY; then
    "$@"
  else
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  fi
}

log "project_id=$PROJECT_ID"
log "project_number=$PROJECT_NUMBER"
log "region=$REGION"
log "cloud_run_service=$CLOUD_RUN_SERVICE"
log "firestore_collection=$COLLECTION"
log "github_repo=$GITHUB_REPO"
log "mode=$($APPLY && echo apply || echo dry-run)"

# Provider APIs used by GitHub WIF and the live-proof lane.
apply_or_plan gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  --project="$PROJECT_ID"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  log "service account exists: $SA_EMAIL"
else
  apply_or_plan gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project="$PROJECT_ID" \
    --display-name="ProofFleet GitHub live-proof"
fi

if gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  log "workload identity pool exists: $POOL_NAME"
else
  apply_or_plan gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name="ProofFleet GitHub Actions"
fi

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  ACTUAL_ISSUER="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --format='value(oidc.issuerUri)')"
  ACTUAL_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --format='value(attributeCondition)')"
  if [[ "$ACTUAL_ISSUER" != "$EXPECTED_ISSUER" || "$ACTUAL_CONDITION" != "$EXPECTED_CONDITION" ]]; then
    echo "Existing WIF provider does not match the required issuer/repository restriction." >&2
    echo "issuer=$ACTUAL_ISSUER" >&2
    echo "condition=$ACTUAL_CONDITION" >&2
    exit 3
  fi
  log "WIF provider exists and repository condition matches"
else
  apply_or_plan gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="ProofFleet repository" \
    --issuer-uri="$EXPECTED_ISSUER" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition="$EXPECTED_CONDITION"
fi

# Allow only identities admitted through the exact-repository attribute to
# impersonate the dedicated service account. No key material is created.
apply_or_plan gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET"

# Current live-proof lane needs Cloud Run readback and Firestore proof write/readback.
for role in roles/run.viewer roles/datastore.user; do
  apply_or_plan gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None
 done

# These are read-only provider preflights. We intentionally do not create a
# Firestore database because its location choice should be explicit.
if gcloud firestore databases describe --database='(default)' --project="$PROJECT_ID" >/dev/null 2>&1; then
  log "Firestore default database exists"
else
  echo "Firestore default database is missing. Create it explicitly in the intended location before live proof." >&2
  exit 4
fi

if gcloud run services describe "$CLOUD_RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  log "Cloud Run service exists: $CLOUD_RUN_SERVICE ($REGION)"
else
  echo "Cloud Run service '$CLOUD_RUN_SERVICE' was not found in region '$REGION'." >&2
  exit 4
fi

if $APPLY; then
  PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --format='value(name)')"
else
  PROVIDER_NAME="$EXPECTED_PROVIDER_NAME"
fi

DECLARED_SOURCE_REVISION="$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format="value(spec.template.spec.containers[0].env[?name='PROOFFLEET_SOURCE_REVISION'].value)" 2>/dev/null || true)"

if [[ -n "$DECLARED_SOURCE_REVISION" ]]; then
  log "Cloud Run currently declares PROOFFLEET_SOURCE_REVISION=$DECLARED_SOURCE_REVISION"
else
  log "Cloud Run does not yet expose PROOFFLEET_SOURCE_REVISION; the live-proof workflow will remain fail-closed until deployment binds it."
fi

cat <<EOF

ProofFleet repository variables to set after verifying the values above:

PROOFFLEET_GCP_PROJECT_ID=$PROJECT_ID
PROOFFLEET_GCP_REGION=$REGION
PROOFFLEET_GCP_WIF_PROVIDER=$PROVIDER_NAME
PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT=$SA_EMAIL
PROOFFLEET_CLOUDRUN_SERVICE=$CLOUD_RUN_SERVICE
PROOFFLEET_FIRESTORE_COLLECTION=$COLLECTION

Optional GitHub CLI commands (these values are configuration, not secrets):

gh variable set PROOFFLEET_GCP_PROJECT_ID --repo "$GITHUB_REPO" --body "$PROJECT_ID"
gh variable set PROOFFLEET_GCP_REGION --repo "$GITHUB_REPO" --body "$REGION"
gh variable set PROOFFLEET_GCP_WIF_PROVIDER --repo "$GITHUB_REPO" --body "$PROVIDER_NAME"
gh variable set PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT --repo "$GITHUB_REPO" --body "$SA_EMAIL"
gh variable set PROOFFLEET_CLOUDRUN_SERVICE --repo "$GITHUB_REPO" --body "$CLOUD_RUN_SERVICE"
gh variable set PROOFFLEET_FIRESTORE_COLLECTION --repo "$GITHUB_REPO" --body "$COLLECTION"
EOF

if ! $APPLY; then
  log "dry-run complete; rerun with --apply only after the project/region/service identities are confirmed"
fi
