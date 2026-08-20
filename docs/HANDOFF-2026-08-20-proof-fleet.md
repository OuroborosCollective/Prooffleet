# ProofFleet Hardening Handoff — 2026-08-20

Status: **checkpoint / manual live-GCP proof lane prepared — NOT executed**

Repository: `OuroborosCollective/Prooffleet`
Branch: `hardening/fortified-fleet`
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`
Last verified source head: `df57a7ed847af127b319a686aef34129dc818362`
GitHub synthetic merge SHA tested for that head: `450e413544c613e8f9941f2e4aa62d4afe8b2671`
GitHub Actions run: `32328115254` / run number `85`

## Latest verified checkpoint

The source head `df57a7ed847af127b319a686aef34129dc818362` was read back from PR metadata. GitHub Actions run #85 completed successfully against the synthetic merge candidate `450e413544c613e8f9941f2e4aa62d4afe8b2671`.

Remote evidence from that one run:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit` passed
- **23 test files passed**
- **92 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- real production-server HTTP smoke passed on injected `PORT=3187`
- authenticated consent production HTTP E2E passed
- high/critical dependency audit passed
- package-lock bootstrap correctly skipped
- CI revision receipt separates source head from synthetic merge SHA
- Cloud Run readback regressions prove old/mismatched source revisions cannot be accepted as current deployment proof
- live-GCP proof-plan regressions prove no mutation authorization without the exact workflow-dispatch confirmation phrase
- live-GCP workflow regressions prove the workflow is manual-only and uses OIDC/Workload Identity Federation rather than a long-lived service-account JSON key

Exact revision receipt from run #85:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "df57a7ed847af127b319a686aef34129dc818362",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "450e413544c613e8f9941f2e4aa62d4afe8b2671",
  "testedMergeSha": "450e413544c613e8f9941f2e4aa62d4afe8b2671"
}
```

This handoff update is documentation-only and therefore creates a newer branch head. Before later engineering is called current-green, read back that new head and its own PR CI.

## Closed P0s

### Authenticated consent production HTTP E2E

The canonical verifier executes `scripts/verify-consent-http-e2e.mjs` through `npm run verify:ci` against the real built production server.

The E2E proves:

1. mission reaches pending consent;
2. unauthenticated response is rejected;
3. invalid operator credentials are rejected;
4. valid login produces a signed short-lived HttpOnly, SameSite=Strict, Secure session cookie;
5. operator identity comes from the server-side session;
6. client identity cannot override it;
7. human REJECTED is authentic but never execution authorization;
8. rejection remains `BLOCKED_BY_MISSING_EVIDENCE`;
9. APPROVED without a real effect executor still cannot create false success.

### Consent decision authenticity

`ConsentEngine` separates:

- `validateDecisionForOperation()` — verifies an engine-issued APPROVED or REJECTED decision for exactly one operation;
- `validateGrantForOperation()` — execution permission and therefore APPROVED-only.

Forged request IDs and forged operator identities are regression-tested.

### Mission-scoped Judge truth

The EvidenceLedger remains globally hash-chained, but final mission truth is evaluated only against evidence/receipts for the exact current mission manifest/revision. A previous mission cannot contaminate a later mission verdict.

### CI source-head vs tested-merge identity

`prooffleet.ci-revision-receipt.v1` records `sourceHeadSha`, `baseSha`, `testedCheckoutSha` and `testedMergeSha`. Source head and GitHub's synthetic merge commit are never collapsed into one ambiguous `tested_sha`.

### Cloud Run runtime PORT compatibility

The production server honors Cloud Run's injected `PORT`, defaults to 3000 outside managed runtimes, and rejects malformed/out-of-range ports. Canonical CI proves startup on `PORT=3187`.

### Idempotency / ambiguous-write safety

- same-operation concurrent calls are deduplicated in-flight;
- regression: 50 parallel calls -> exactly one apply;
- readback-before-retry is mandatory for mutating operations;
- unavailable readback never authorizes a blind write;
- conflicting operation identity fails closed instead of overwriting;
- consent/provider failures do not poison the durable idempotency cache;
- only observed durable success is cached as final.

## Truth/evidence boundary

- no hardcoded truth/consensus scores in the production truth path;
- internal hashes prove integrity, not external-world truth;
- independent verifier operates on snapshots;
- Judge is non-mutating and fail-closed;
- verdict vocabulary remains `VERIFIED`, `BLOCKED_BY_MISSING_EVIDENCE`, `CONTRADICTED`;
- runtime-required claims require explicitly allowed authoritative source kinds;
- proof requirements bind operation identity and revision where required;
- memory cannot satisfy runtime proof;
- no runtime mock/fake may satisfy production evidence.

## Manual live Google Cloud proof lane — prepared, not executed

Canonical workflow: `.github/workflows/gcp-live-proof.yml`

Properties already regression-tested in normal PR CI:

- `workflow_dispatch` only — never `push`/`pull_request`;
- `permissions: contents: read` + `id-token: write`;
- Google auth uses `google-github-actions/auth@v3` and Workload Identity Federation;
- no `credentials_json` or long-lived service-account key path;
- exact source revision is `${{ github.sha }}`;
- mutating Firestore proof requires exact input:
  `I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE`;
- missing configuration fails before provider mutation;
- generated `gha-creds-*.json` is ignored by Git and Docker build context;
- `gcp-live-proof-receipt.json` is artifact output, not source control;
- live receipt is uploaded as a GitHub Actions artifact.

### Cloud Run provenance gate

`CloudRunAdapter` now reads the non-secret service environment declaration `PROOFFLEET_SOURCE_REVISION` from the real Cloud Run service metadata.

Evidence includes:

- service identity / URI;
- latest ready / created revision when provider returns them;
- reconciling state;
- declared `PROOFFLEET_SOURCE_REVISION`;
- `sourceRevisionMatchesExpected`.

A service existing in GCP is **not enough**. If its declared source revision differs from the workflow source head, the live proof remains `BLOCKED_BY_MISSING_EVIDENCE` and no Firestore proof write is authorized.

### Live proof operation

`server/gcp/liveProof.ts` deterministically constructs a revision-bound Firestore operation.

The plan binds:

- exact source SHA;
- workflow run ID;
- hash of GitHub actor (raw actor not persisted in the operation);
- Firestore collection;
- parameters hash;
- deterministic operation ID.

`scripts/gcp-live-proof.ts` performs:

1. real Cloud Run authoritative readback;
2. source-revision equality check;
3. explicit workflow confirmation check;
4. real Firestore store construction via ADC/WIF credentials;
5. operation-bound ConsentEngine grant created only from the explicit manual dispatch;
6. normal `FirestoreOperatorExecutor` path;
7. authoritative Firestore readback;
8. hashed machine-readable receipt.

Receipt outcomes are deliberately `OBSERVED`, `BLOCKED_BY_MISSING_EVIDENCE`, or `CONTRADICTED`. `OBSERVED` here means the provider effects were observed; it does **not** bypass the application's independent Judge or manufacture a `VERIFIED` mission verdict.

## Live GCP configuration still required

No live GCP success is claimed yet.

The workflow currently requires these GitHub repository variables, all resolved from the real Google Cloud account rather than guessed:

- `PROOFFLEET_GCP_PROJECT_ID`
- `PROOFFLEET_GCP_REGION`
- `PROOFFLEET_GCP_WIF_PROVIDER`
- `PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT`
- `PROOFFLEET_CLOUDRUN_SERVICE`
- `PROOFFLEET_FIRESTORE_COLLECTION`

The Workload Identity Provider must be a full resource name:

`projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`

The service account must be the real WIF-bound service account with only the permissions needed for Cloud Run readback and the selected Firestore proof operation.

Because the current ChatGPT session has no direct Google Cloud mutation connector, a one-time owner-side GCP bootstrap may still be required to create/resolve WIF, IAM, Cloud Run and Firestore resources. Do not replace this boundary with a service-account key or invented project metadata.

## Working method — mandatory continuation pattern

### Secure first

Before switching task/context/tool:

1. push/write one coherent change set to the feature branch;
2. read exact PR head from GitHub;
3. confirm `main` did not move unexpectedly;
4. read remote CI for that exact candidate;
5. inspect the actual job/log, not only a green badge;
6. record source-head vs synthetic-merge identity;
7. update this handoff when a meaningful P0 boundary closes.

### One causal error family at a time

When CI/runtime turns red:

1. fetch exact failing job/log;
2. identify the first causal family;
3. patch only that family;
4. add a regression that would have failed before the patch;
5. push;
6. run/read the same remote lane again;
7. do not begin unrelated work until that lane is understood.

### Evidence before labels

Never accept `green`, `verified`, `deployed` or `cloud-ready` merely because an internal report/string says so.

Unit adapter tests prove contracts only. Production HTTP smoke proves local built-runtime behavior only. Cloud Run/Firestore claims require real provider readback.

### Fail closed

If a required provider observation cannot be obtained, remain:

`BLOCKED_BY_MISSING_EVIDENCE`

Never create a fallback success.

## Next work — exact order

### P0 — resolve live Google Cloud identity and WIF

1. read the new documentation head + its CI;
2. resolve the actual AI-Studio-linked GCP project ID/region and Cloud Run service if they exist;
3. resolve/create WIF provider and WIF-bound service account with minimal IAM;
4. resolve Firestore collection/database;
5. set the six GitHub repository variables above;
6. do **not** run the manual workflow until those identities are independently checked.

### P0 — execute the live provider proof

After configuration is known:

1. deploy or identify the exact current ProofFleet source revision on Cloud Run;
2. require `PROOFFLEET_SOURCE_REVISION` on the service to equal the workflow source head;
3. manually dispatch `ProofFleet Live GCP Proof` with the exact confirmation phrase;
4. read Cloud Run service/revision from Google API;
5. execute one operation-bound Firestore proof write;
6. read back the exact Firestore document identity;
7. download/read the resulting live-proof receipt artifact;
8. only then project the authoritative observation into application Evidence/Receipt and require the independent Judge to produce `VERIFIED` for the demo mission.

### P1 — Pub/Sub

After Cloud Run + Firestore causal proof is stable, bind a real Pub/Sub message/correlation identity into mission evidence.

### P1 — Fortified Enterprise Fleet managed surfaces

Only after the core proof path is stable, add/prove the managed services that materially improve the judged demo: ADK/Agent Runtime, Agent Registry, Memory Bank, Agent Identity/Gateway, Model Armor and OpenTelemetry/Observability.

No managed-service claim without provision + readback.

## Devpost state

Devpost project exists as `ProofFleet` at `https://devpost.com/software/prooffleet` and the code-repository link is registered as `https://github.com/OuroborosCollective/Prooffleet`.

Do **not** final-submit yet. Required claims about Google Cloud services, model, architecture diagram and demo video must reflect the final evidenced implementation.

## Merge rule

Keep PR #1 Draft until at minimum:

- current branch head has green immutable-lock CI;
- authenticated consent production HTTP E2E is green;
- source-head/tested-merge identities are unambiguous;
- managed runtime PORT is proven;
- at least one real Google Cloud mutating effect is proven by authoritative readback;
- no production truth path uses mocks/fakes;
- final demo visibly traces mission -> operation -> consent -> effect -> readback -> evidence -> Judge.

Do not merge `main` merely because local/unit architecture is strong.

## Resume instruction

On resume:

1. read PR metadata/current head;
2. read latest workflow run/jobs/log;
3. read this handoff;
4. read the files/tests for the next P0;
5. state the exact source revision and current runtime evidence;
6. make one causal change;
7. regression-test, push and read back remote evidence before proceeding.
