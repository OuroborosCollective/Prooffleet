#!/usr/bin/env bash
set -euo pipefail

# ProofFleet Google Cloud candidate-deploy bootstrap.
#
# Safety contract:
# - default mode is read-only/dry-run;
# - mutations require an explicit --apply flag;
# - no long-lived service-account key is created or accepted;
# - GitHub OIDC/WIF authorization is bound to immutable repository/owner/actor IDs;
# - repository names remain descriptive only and are not authorization evidence;
# - deployment uses a dedicated service account, never the Cloud Run runtime SA;
# - the existing Cloud Run runtime service account is discovered authoritatively
#   and only grants iam.serviceAccounts.actAs to the dedicated deployer;
# - Artifact Registry is isolated to one Docker repository;
# - no Firestore resource or location is touched by this bootstrap;
# - no Cloud Run revision is deployed and no traffic is changed here.

GITHUB_REPO="OuroborosCollective/Prooffleet"
GITHUB_REPOSITORY_ID="1339097875"
GITHUB_OWNER_ID="266194342"
POOL_ID="prooffleet-github"
PROVIDER_ID="prooffleet-repo"
DEPLOY_SERVICE_ACCOUNT_ID="prooffleet-deploy"
ARTIFACT_REPOSITORY="prooffleet"
PROJECT_ID=""
PROJECT_NUMBER_INPUT=""
PROJECT_NUMBER=""
REGION=""
CLOUD_RUN_SERVICE=""
APPLY=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/bootstrap-gcp-deploy.sh \
    (--project-id <gcp-project-id> | --project-number <numeric-project-number>) \
    --region <cloud-run-region> \
    --cloud-run-service <existing-service-name> \
    [--artifact-repository <docker-repository-id>] \
    [--apply]

Without --apply this script performs provider discovery and prints mutations
without executing them. It never creates or accepts a service-account JSON key.
It never creates Firestore resources and never deploys or promotes Cloud Run.
EOF
}

while (($#)); do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"; shift 2 ;;
    --project-number)
      PROJECT_NUMBER_INPUT="${2:-}"; shift 2 ;;
    --region)
      REGION="${2:-}"; shift 2 ;;
    --cloud-run-service)
      CLOUD_RUN_SERVICE="${2:-}"; shift 2 ;;
    --artifact-repository)
      ARTIFACT_REPOSITORY="${2:-}"; shift 2 ;;
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

if [[ -z "$PROJECT_ID" && -z "$PROJECT_NUMBER_INPUT" ]]; then
  echo "One of --project-id or --project-number is required." >&2
  usage >&2
  exit 2
fi
if [[ -z "$REGION" || -z "$CLOUD_RUN_SERVICE" ]]; then
  echo "--region and --cloud-run-service are required." >&2
  usage >&2
  exit 2
fi

if [[ -n "$PROJECT_ID" && ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Malformed Google Cloud project ID: $PROJECT_ID" >&2
  exit 2
fi
if [[ -n "$PROJECT_NUMBER_INPUT" && ! "$PROJECT_NUMBER_INPUT" =~ ^[0-9]+$ ]]; then
  echo "Malformed Google Cloud project number: $PROJECT_NUMBER_INPUT" >&2
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
if [[ ! "$ARTIFACT_REPOSITORY" =~ ^[a-z][a-z0-9._-]{0,62}$ ]]; then
  echo "Malformed Artifact Registry repository ID: $ARTIFACT_REPOSITORY" >&2
  exit 2
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required. Run this script from Google Cloud Shell or a configured gcloud environment." >&2
  exit 2
}

log() { printf '[proofleet-deploy] %s\n' "$*"; }

apply_or_plan() {
  if $APPLY; then
    "$@"
  else
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  fi
}

PROJECT_LOOKUP="${PROJECT_ID:-$PROJECT_NUMBER_INPUT}"
RESOLVED_PROJECT_ID="$(gcloud projects describe "$PROJECT_LOOKUP" --format='value(projectId)')"
RESOLVED_PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_LOOKUP" --format='value(projectNumber)')"

if [[ ! "$RESOLVED_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Could not resolve a canonical project ID from '$PROJECT_LOOKUP'." >&2
  exit 2
fi
if [[ ! "$RESOLVED_PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve a numeric project number from '$PROJECT_LOOKUP'." >&2
  exit 2
fi
if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "$RESOLVED_PROJECT_ID" ]]; then
  echo "Supplied project ID does not match Google Cloud readback: $PROJECT_ID != $RESOLVED_PROJECT_ID" >&2
  exit 3
fi
if [[ -n "$PROJECT_NUMBER_INPUT" && "$PROJECT_NUMBER_INPUT" != "$RESOLVED_PROJECT_NUMBER" ]]; then
  echo "Supplied project number does not match Google Cloud readback: $PROJECT_NUMBER_INPUT != $RESOLVED_PROJECT_NUMBER" >&2
  exit 3
fi

PROJECT_ID="$RESOLVED_PROJECT_ID"
PROJECT_NUMBER="$RESOLVED_PROJECT_NUMBER"
DEPLOY_SA_EMAIL="${DEPLOY_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
EXPECTED_PROVIDER_NAME="${POOL_NAME}/providers/${PROVIDER_ID}"
PRINCIPAL_SET="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${GITHUB_REPOSITORY_ID}"
EXPECTED_ISSUER="https://token.actions.githubusercontent.com"
EXPECTED_CONDITION="assertion.repository_id == '${GITHUB_REPOSITORY_ID}' && assertion.repository_owner_id == '${GITHUB_OWNER_ID}' && assertion.actor_id == '${GITHUB_OWNER_ID}'"
EXPECTED_ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.actor_id=assertion.actor_id,attribute.ref=assertion.ref"

if ! gcloud run services describe "$CLOUD_RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  echo "Cloud Run service '$CLOUD_RUN_SERVICE' was not found in '$PROJECT_ID/$REGION'." >&2
  exit 4
fi

RUNTIME_SA="$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"
if [[ ! "$RUNTIME_SA" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$ ]]; then
  echo "Cloud Run runtime service account could not be read authoritatively: '$RUNTIME_SA'" >&2
  exit 4
fi
if [[ "$RUNTIME_SA" == "$DEPLOY_SA_EMAIL" ]]; then
  echo "Refusing identity collapse: deployment and runtime service accounts must be distinct." >&2
  exit 4
fi

log "project_id=$PROJECT_ID"
log "project_number=$PROJECT_NUMBER"
log "region=$REGION"
log "cloud_run_service=$CLOUD_RUN_SERVICE"
log "runtime_service_account=$RUNTIME_SA"
log "deploy_service_account=$DEPLOY_SA_EMAIL"
log "artifact_repository=$ARTIFACT_REPOSITORY"
log "github_repo_description=$GITHUB_REPO"
log "github_repository_id=$GITHUB_REPOSITORY_ID"
log "github_owner_id=$GITHUB_OWNER_ID"
log "mode=$($APPLY && echo apply || echo dry-run)"

apply_or_plan gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  --project="$PROJECT_ID"

if gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  log "deploy service account exists: $DEPLOY_SA_EMAIL"
else
  apply_or_plan gcloud iam service-accounts create "$DEPLOY_SERVICE_ACCOUNT_ID" \
    --project="$PROJECT_ID" \
    --display-name="ProofFleet GitHub candidate deployer"
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
  PROVIDER_JSON="$(mktemp)"
  trap 'rm -f "$PROVIDER_JSON"' EXIT
  gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --format=json > "$PROVIDER_JSON"
  if [[ "$ACTUAL_ISSUER" != "$EXPECTED_ISSUER" || "$ACTUAL_CONDITION" != "$EXPECTED_CONDITION" ]]; then
    echo "Existing WIF provider does not match the immutable-ID issuer/repository/actor restriction." >&2
    echo "issuer=$ACTUAL_ISSUER" >&2
    echo "condition=$ACTUAL_CONDITION" >&2
    exit 3
  fi
  python3 - "$PROVIDER_JSON" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    provider = json.load(handle)
mapping = provider.get('attributeMapping') or {}
required = {
    'google.subject': 'assertion.sub',
    'attribute.repository_id': 'assertion.repository_id',
    'attribute.repository_owner_id': 'assertion.repository_owner_id',
    'attribute.actor_id': 'assertion.actor_id',
    'attribute.ref': 'assertion.ref',
}
if any(mapping.get(key) != value for key, value in required.items()):
    raise SystemExit('Existing WIF provider attribute mapping is missing immutable GitHub identity claims.')
PY
  log "WIF provider exists and immutable repository/owner/actor identity contract matches"
else
  apply_or_plan gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="ProofFleet repository" \
    --issuer-uri="$EXPECTED_ISSUER" \
    --attribute-mapping="$EXPECTED_ATTRIBUTE_MAPPING" \
    --attribute-condition="$EXPECTED_CONDITION"
fi

apply_or_plan gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET"

ARTIFACT_API_ENABLED="$(gcloud services list --enabled --project="$PROJECT_ID" \
  --filter='config.name=artifactregistry.googleapis.com' --format='value(config.name)' 2>/dev/null || true)"

if $APPLY || [[ "$ARTIFACT_API_ENABLED" == "artifactregistry.googleapis.com" ]]; then
  if gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
    REPOSITORY_FORMAT="$(gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
      --project="$PROJECT_ID" --location="$REGION" --format='value(format)')"
    if [[ "$REPOSITORY_FORMAT" != "DOCKER" ]]; then
      echo "Artifact Registry repository '$ARTIFACT_REPOSITORY' exists but is format '$REPOSITORY_FORMAT', not DOCKER." >&2
      exit 4
    fi
    log "Artifact Registry Docker repository exists: $ARTIFACT_REPOSITORY ($REGION)"
  else
    apply_or_plan gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
      --project="$PROJECT_ID" \
      --location="$REGION" \
      --repository-format=docker \
      --description="ProofFleet immutable candidate images"
  fi
else
  log "Artifact Registry API is currently disabled; dry-run cannot resolve repository existence before enablement."
  log "--apply will enable the API, re-check the repository, and create it only if absent."
fi

apply_or_plan gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

apply_or_plan gcloud run services add-iam-policy-binding "$CLOUD_RUN_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/run.developer"

apply_or_plan gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

if $APPLY; then
  PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --format='value(name)')"
else
  PROVIDER_NAME="$EXPECTED_PROVIDER_NAME"
fi

cat <<EOF

ProofFleet candidate-deploy repository variables to set after verifying the readback above:

PROOFFLEET_GCP_PROJECT_ID=$PROJECT_ID
PROOFFLEET_GCP_REGION=$REGION
PROOFFLEET_GCP_WIF_PROVIDER=$PROVIDER_NAME
PROOFFLEET_GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOY_SA_EMAIL
PROOFFLEET_CLOUDRUN_SERVICE=$CLOUD_RUN_SERVICE
PROOFFLEET_ARTIFACT_REPOSITORY=$ARTIFACT_REPOSITORY

Optional GitHub CLI commands (configuration values, not secrets):

gh variable set PROOFFLEET_GCP_PROJECT_ID --repo "$GITHUB_REPO" --body "$PROJECT_ID"
gh variable set PROOFFLEET_GCP_REGION --repo "$GITHUB_REPO" --body "$REGION"
gh variable set PROOFFLEET_GCP_WIF_PROVIDER --repo "$GITHUB_REPO" --body "$PROVIDER_NAME"
gh variable set PROOFFLEET_GCP_DEPLOY_SERVICE_ACCOUNT --repo "$GITHUB_REPO" --body "$DEPLOY_SA_EMAIL"
gh variable set PROOFFLEET_CLOUDRUN_SERVICE --repo "$GITHUB_REPO" --body "$CLOUD_RUN_SERVICE"
gh variable set PROOFFLEET_ARTIFACT_REPOSITORY --repo "$GITHUB_REPO" --body "$ARTIFACT_REPOSITORY"
EOF

if ! $APPLY; then
  log "dry-run complete; no IAM, registry, Cloud Run, traffic or Firestore mutation was performed"
fi
