# ProofFleet — GCP Live Proof Setup

This file defines the exact non-secret Google Cloud identities required by `.github/workflows/gcp-live-proof.yml`.

Do not upload or commit a long-lived service-account JSON key. ProofFleet uses GitHub OIDC + Google Workload Identity Federation (WIF).

## Required GitHub repository variables

Set these six repository variables on `OuroborosCollective/Prooffleet`:

```text
PROOFFLEET_GCP_PROJECT_ID
PROOFFLEET_GCP_REGION
PROOFFLEET_GCP_WIF_PROVIDER
PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT
PROOFFLEET_CLOUDRUN_SERVICE
PROOFFLEET_FIRESTORE_COLLECTION
```

### 1. `PROOFFLEET_GCP_PROJECT_ID`

The Google Cloud **project ID** that owns the ProofFleet Cloud Run / Firestore resources. Use the project ID, not the project number and not the billing-account ID.

Example shape:

```text
my-proofleet-project
```

### 2. `PROOFFLEET_GCP_REGION`

The Cloud Run region for the ProofFleet service.

Example shape:

```text
europe-west1
```

### 3. `PROOFFLEET_GCP_WIF_PROVIDER`

The **full Workload Identity Provider resource name** used by GitHub Actions.

Required shape:

```text
projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
```

The workflow intentionally rejects short names.

### 4. `PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT`

The service account GitHub Actions is allowed to impersonate through WIF.

Required shape:

```text
<NAME>@<PROJECT_ID>.iam.gserviceaccount.com
```

The service account should have only the permissions needed for the live proof: Cloud Run readback plus the bounded Firestore proof operation.

### 5. `PROOFFLEET_CLOUDRUN_SERVICE`

The exact Cloud Run **service name** for the submitted ProofFleet runtime.

Example shape:

```text
prooffleet
```

The deployed service must expose:

```text
PROOFFLEET_SOURCE_REVISION=<exact GitHub source SHA>
```

The live proof fails closed if the provider-side declared revision does not equal the workflow source SHA.

### 6. `PROOFFLEET_FIRESTORE_COLLECTION`

The Firestore collection dedicated to the operation-bound proof write/readback.

Recommended dedicated collection:

```text
prooffleet-live-proof
```

Use a dedicated collection rather than an unrelated production collection.

## WIF requirements

The workflow uses:

```text
actions/checkout@v7
google-github-actions/auth@v3
id-token: write
```

Google's current GitHub Action documentation recommends WIF over long-lived service-account keys. The `workload_identity_provider` input must be the full provider resource name, and the service-account email is supplied when using WIF through service-account impersonation.

The WIF trust must be restricted to the intended GitHub repository:

```text
OuroborosCollective/Prooffleet
```

Do not authorize an unrestricted GitHub organization or arbitrary repository if repository-level binding is available.

## Live proof authorization

The workflow is manual-only and requires this exact confirmation phrase:

```text
I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE
```

That phrase authorizes one bounded proof operation for the workflow run. It is not a standing consent grant for future writes.

## Expected evidence

A valid run must produce:

```text
gcp-live-proof-receipt.json
```

and the workflow only succeeds when the receipt outcome is:

```text
OBSERVED
```

Even then, `OBSERVED` is provider evidence, not an automatic application-level `VERIFIED`; the ProofFleet Verifier/Judge boundary remains authoritative.

## Current status at creation

Repository, Gmail and Google Drive discovery did not expose authoritative values for the six variables above. They must therefore be taken from the actual Google Cloud project / IAM / Cloud Run / Firestore configuration, not guessed from billing IDs, filenames or AI Studio branding.
