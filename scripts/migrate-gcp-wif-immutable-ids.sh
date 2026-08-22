#!/usr/bin/env bash
set -euo pipefail

# Migrates the existing ProofFleet GitHub OIDC trust boundary from mutable
# repository names to GitHub's immutable numeric owner/repository claims.
#
# Safety contract:
# - default mode is read-only and prints the exact mutation plan;
# - --apply is required for every provider or IAM mutation;
# - the existing pool, provider and service accounts must already exist;
# - no service-account key is created, accepted or printed;
# - the numeric principalSet is added and read back before the legacy
#   name-based principalSet is removed;
# - provider and service-account policies are read back after every mutation;
# - Cloud Run, Artifact Registry, Firestore and traffic are never mutated.

GITHUB_REPO="OuroborosCollective/Prooffleet"
GITHUB_REPOSITORY_ID="1339097875"
GITHUB_REPOSITORY_OWNER_ID="266194342"
POOL_ID="prooffleet-github"
PROVIDER_ID="prooffleet-repo"
PROJECT_ID=""
PROJECT_NUMBER_INPUT=""
APPLY=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/migrate-gcp-wif-immutable-ids.sh \
    (--project-id <gcp-project-id> | --project-number <numeric-project-number>) \
    [--apply]

Without --apply the script performs only provider and IAM policy readbacks and
prints the exact migration commands. It never creates long-lived credentials,
Cloud Run revisions, Firestore documents, registry images or traffic changes.
EOF
}

while (($#)); do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"; shift 2 ;;
    --project-number)
      PROJECT_NUMBER_INPUT="${2:-}"; shift 2 ;;
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
  exit 2
fi
if [[ -n "$PROJECT_ID" && ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Malformed Google Cloud project ID: $PROJECT_ID" >&2
  exit 2
fi
if [[ -n "$PROJECT_NUMBER_INPUT" && ! "$PROJECT_NUMBER_INPUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "Malformed Google Cloud project number: $PROJECT_NUMBER_INPUT" >&2
  exit 2
fi
for id in "$GITHUB_REPOSITORY_ID" "$GITHUB_REPOSITORY_OWNER_ID"; do
  if [[ ! "$id" =~ ^[1-9][0-9]*$ ]]; then
    echo "Configured immutable GitHub ID is malformed: $id" >&2
    exit 2
  fi
done

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required." >&2
  exit 2
}
command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required for strict provider/policy readback validation." >&2
  exit 2
}

log() { printf '[proofleet-wif-migration] %s\n' "$*"; }
plan() {
  printf '[dry-run]'
  printf ' %q' "$@"
  printf '\n'
}

PROJECT_LOOKUP="${PROJECT_ID:-$PROJECT_NUMBER_INPUT}"
RESOLVED_PROJECT_ID="$(gcloud projects describe "$PROJECT_LOOKUP" --format='value(projectId)')"
RESOLVED_PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_LOOKUP" --format='value(projectNumber)')"
if [[ ! "$RESOLVED_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Could not resolve canonical project ID." >&2
  exit 3
fi
if [[ ! "$RESOLVED_PROJECT_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not resolve canonical project number." >&2
  exit 3
fi
if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != "$RESOLVED_PROJECT_ID" ]]; then
  echo "Supplied project ID does not match Google Cloud readback." >&2
  exit 3
fi
if [[ -n "$PROJECT_NUMBER_INPUT" && "$PROJECT_NUMBER_INPUT" != "$RESOLVED_PROJECT_NUMBER" ]]; then
  echo "Supplied project number does not match Google Cloud readback." >&2
  exit 3
fi
PROJECT_ID="$RESOLVED_PROJECT_ID"
PROJECT_NUMBER="$RESOLVED_PROJECT_NUMBER"

POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
PROVIDER_NAME="${POOL_NAME}/providers/${PROVIDER_ID}"
EXPECTED_ISSUER="https://token.actions.githubusercontent.com"
EXPECTED_CONDITION="assertion.repository_owner_id == '${GITHUB_REPOSITORY_OWNER_ID}' && assertion.repository_id == '${GITHUB_REPOSITORY_ID}'"
EXPECTED_MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref"
IMMUTABLE_PRINCIPAL_SET="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${GITHUB_REPOSITORY_ID}"
LEGACY_PRINCIPAL_SET="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"
SERVICE_ACCOUNTS=(
  "prooffleet-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
  "prooffleet-github@${PROJECT_ID}.iam.gserviceaccount.com"
)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PROVIDER_JSON="$TMP_DIR/provider.json"

read_provider() {
  gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --format=json > "$PROVIDER_JSON"
}

provider_matches() {
  python3 - "$PROVIDER_JSON" "$EXPECTED_ISSUER" "$EXPECTED_CONDITION" <<'PY'
import json
import sys

path, expected_issuer, expected_condition = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    provider = json.load(handle)

issuer = str(provider.get('oidc', {}).get('issuerUri', '')).rstrip('/')
condition = ''.join(str(provider.get('attributeCondition', '')).split())
expected_condition = ''.join(expected_condition.split())
mapping = provider.get('attributeMapping')
required = {
    'google.subject': 'assertion.sub',
    'attribute.repository_id': 'assertion.repository_id',
    'attribute.repository_owner_id': 'assertion.repository_owner_id',
    'attribute.repository': 'assertion.repository',
    'attribute.repository_owner': 'assertion.repository_owner',
    'attribute.ref': 'assertion.ref',
}
errors = []
if str(provider.get('state', '')) != 'ACTIVE':
    errors.append('provider is not ACTIVE')
if issuer != expected_issuer.rstrip('/'):
    errors.append('issuer mismatch')
if condition != expected_condition:
    errors.append('immutable-ID condition mismatch')
if not isinstance(mapping, dict):
    errors.append('attributeMapping is not an object')
else:
    for key, value in required.items():
        if mapping.get(key) != value:
            errors.append(f'mapping mismatch for {key}')
if errors:
    print('provider_readback_mismatch=' + '; '.join(errors), file=sys.stderr)
    raise SystemExit(1)
PY
}

policy_has_member() {
  local policy_path="$1"
  local member="$2"
  python3 - "$policy_path" "$member" <<'PY'
import json
import sys

path, member = sys.argv[1:]
with open(path, encoding='utf-8') as handle:
    policy = json.load(handle)
for binding in policy.get('bindings', []):
    if binding.get('role') == 'roles/iam.workloadIdentityUser' and member in binding.get('members', []):
        raise SystemExit(0)
raise SystemExit(1)
PY
}

read_policy() {
  local service_account="$1"
  local output_path="$2"
  gcloud iam service-accounts get-iam-policy "$service_account" \
    --project="$PROJECT_ID" --format=json > "$output_path"
}

log "project_id=$PROJECT_ID"
log "project_number=$PROJECT_NUMBER"
log "provider=$PROVIDER_NAME"
log "github_repository_id=$GITHUB_REPOSITORY_ID"
log "github_repository_owner_id=$GITHUB_REPOSITORY_OWNER_ID"
log "mode=$($APPLY && echo apply || echo dry-run)"

read_provider
if provider_matches; then
  log "provider already uses immutable owner/repository admission"
else
  if $APPLY; then
    gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
      --project="$PROJECT_ID" \
      --location=global \
      --workload-identity-pool="$POOL_ID" \
      --issuer-uri="$EXPECTED_ISSUER" \
      --attribute-mapping="$EXPECTED_MAPPING" \
      --attribute-condition="$EXPECTED_CONDITION"
    read_provider
    provider_matches || {
      echo "Provider update did not survive authoritative readback." >&2
      exit 4
    }
    log "provider immutable-ID condition and mappings verified"
  else
    plan gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
      --project="$PROJECT_ID" \
      --location=global \
      --workload-identity-pool="$POOL_ID" \
      --issuer-uri="$EXPECTED_ISSUER" \
      --attribute-mapping="$EXPECTED_MAPPING" \
      --attribute-condition="$EXPECTED_CONDITION"
  fi
fi

for service_account in "${SERVICE_ACCOUNTS[@]}"; do
  if ! gcloud iam service-accounts describe "$service_account" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Required service account does not exist: $service_account" >&2
    exit 4
  fi

  policy_path="$TMP_DIR/$(printf '%s' "$service_account" | tr '@.' '__').json"
  read_policy "$service_account" "$policy_path"

  if policy_has_member "$policy_path" "$IMMUTABLE_PRINCIPAL_SET"; then
    log "immutable repository-ID principal already bound: $service_account"
  elif $APPLY; then
    gcloud iam service-accounts add-iam-policy-binding "$service_account" \
      --project="$PROJECT_ID" \
      --role=roles/iam.workloadIdentityUser \
      --member="$IMMUTABLE_PRINCIPAL_SET"
    read_policy "$service_account" "$policy_path"
    policy_has_member "$policy_path" "$IMMUTABLE_PRINCIPAL_SET" || {
      echo "Immutable principal binding missing after readback: $service_account" >&2
      exit 4
    }
    log "immutable repository-ID principal binding verified: $service_account"
  else
    plan gcloud iam service-accounts add-iam-policy-binding "$service_account" \
      --project="$PROJECT_ID" \
      --role=roles/iam.workloadIdentityUser \
      --member="$IMMUTABLE_PRINCIPAL_SET"
  fi

  if policy_has_member "$policy_path" "$LEGACY_PRINCIPAL_SET"; then
    if $APPLY; then
      # The numeric binding has already been read back above. Only now may the
      # legacy name-based trust path be removed.
      policy_has_member "$policy_path" "$IMMUTABLE_PRINCIPAL_SET" || {
        echo "Refusing to remove legacy binding before immutable binding readback." >&2
        exit 4
      }
      gcloud iam service-accounts remove-iam-policy-binding "$service_account" \
        --project="$PROJECT_ID" \
        --role=roles/iam.workloadIdentityUser \
        --member="$LEGACY_PRINCIPAL_SET" \
        --quiet
      read_policy "$service_account" "$policy_path"
      policy_has_member "$policy_path" "$IMMUTABLE_PRINCIPAL_SET" || {
        echo "Immutable binding disappeared after legacy removal." >&2
        exit 4
      }
      if policy_has_member "$policy_path" "$LEGACY_PRINCIPAL_SET"; then
        echo "Legacy name-based principal remains after removal." >&2
        exit 4
      fi
      log "legacy name-based principal removed after immutable binding verification: $service_account"
    else
      plan gcloud iam service-accounts remove-iam-policy-binding "$service_account" \
        --project="$PROJECT_ID" \
        --role=roles/iam.workloadIdentityUser \
        --member="$LEGACY_PRINCIPAL_SET" \
        --quiet
    fi
  else
    log "legacy name-based principal is absent: $service_account"
  fi
done

if $APPLY; then
  read_provider
  provider_matches || {
    echo "Final provider readback failed." >&2
    exit 4
  }
  log "migration_status=IMMUTABLE_ID_TRUST_READY"
  log "next_step=run exactly one source-bound candidate-v3 WIF workflow"
else
  log "migration_status=PLAN_ONLY"
  log "no provider, IAM, Cloud Run, Firestore, registry or traffic mutation was performed"
fi
