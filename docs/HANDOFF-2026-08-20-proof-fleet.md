# ProofFleet Hardening Handoff — 2026-08-20

Status: **checkpoint / live-GCP boundary**

Repository: `OuroborosCollective/Prooffleet`
Branch: `hardening/fortified-fleet`
PR: `#1 Hardening: evidence-first fortified fleet`
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`
Last code head verified before this documentation-only handoff update: `40ce539a2f65ef11fc6ee96ed43549e072539c63`
GitHub synthetic merge SHA tested for that head: `00cfeff3d0d581aa76330eccb6b0dc737e3415ef`
GitHub Actions run: `32326318857` / run number `65`

## Verified checkpoint before this handoff update

The code head `40ce539a2f65ef11fc6ee96ed43549e072539c63` was independently read back from PR metadata and its PR CI run completed successfully.

Remote CI evidence on the synthetic merge candidate `00cfeff3d0d581aa76330eccb6b0dc737e3415ef`:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit` passed
- 21 test files passed
- 83 tests passed
- production truth guards passed
- Vite + esbuild production build passed
- real started production-server HTTP smoke passed on explicitly injected `PORT=3187`
- authenticated production consent HTTP E2E passed
- high/critical dependency audit passed
- package-lock bootstrap correctly skipped because the lock already exists
- CI revision receipt explicitly recorded source head, base and tested synthetic merge SHA separately

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "40ce539a2f65ef11fc6ee96ed43549e072539c63",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "00cfeff3d0d581aa76330eccb6b0dc737e3415ef",
  "testedMergeSha": "00cfeff3d0d581aa76330eccb6b0dc737e3415ef"
}
```

Important revision nuance: GitHub PR Actions tests the synthetic merge commit, not the branch source head itself. Therefore the green runtime chain proves merge compatibility of source head `40ce539...` with base `89302df...` through tested merge SHA `00cfeff...`.

This handoff update is documentation-only and creates a newer branch head. That new documentation head must receive its own CI readback before later engineering is called current-green.

## Closed P0 — authenticated consent production HTTP E2E

Canonical verifier now includes `scripts/verify-consent-http-e2e.mjs` and executes it through `npm run verify:ci` against the real built production server.

The production HTTP E2E proves:

1. a mission reaches pending consent;
2. unauthenticated consent response is rejected;
3. invalid operator credentials are rejected;
4. valid operator login produces a signed short-lived HttpOnly, SameSite=Strict, Secure session cookie;
5. server-side operator identity is used;
6. client-supplied operator identity cannot override the server identity;
7. explicit human REJECTED is processed as an authentic decision but never as execution authorization;
8. rejection finishes fail-closed as `BLOCKED_BY_MISSING_EVIDENCE`;
9. explicit APPROVED without a provisioned Firestore effect executor still cannot produce false success;
10. approved-but-unprovisioned runtime remains `BLOCKED_BY_MISSING_EVIDENCE`.

### Bugs found while proving the E2E

#### Consent decision authenticity vs execution permission

`resumeWithGrant()` previously used an APPROVED-only execution validator before entering the REJECTED branch. That made an authentic human rejection logically unreachable.

The ConsentEngine now separates:

- `validateDecisionForOperation()` — verifies that APPROVED or REJECTED was genuinely issued by this ConsentEngine for exactly this operation and operator decision;
- `validateGrantForOperation()` — execution authorization and therefore still APPROVED-only.

Additional adversarial regressions reject forged request IDs and forged operator identities.

#### Cross-mission Judge contamination

The global EvidenceLedger intentionally remains hash-chained across missions, but final mission truth is now judged only against evidence and receipts scoped to the exact current mission manifest/revision.

A previous mission using the same textual final claim can no longer contradict or verify a later mission by accident.

Regression: sequential mission A + mission B must leave mission B blocked by its own missing authoritative effect readback, not contradicted by mission A.

## Closed P0 — CI source-head vs tested-merge identity

CI no longer labels the synthetic pull-request merge commit ambiguously as a generic tested SHA.

`prooffleet.ci-revision-receipt.v1` records:

- `sourceHeadSha`
- `baseSha`
- `testedCheckoutSha`
- `testedMergeSha`

For push events, source head equals tested checkout and `testedMergeSha` is null.
For pull-request events, source head and synthetic merge identity remain distinct.

The receipt fails closed on malformed revision identities, checkout mismatch and unsupported event semantics.

## Closed P0 sub-boundary — Cloud Run runtime PORT compatibility

Official Cloud Run injects the runtime `PORT`. ProofFleet previously hardcoded port 3000, which could make an otherwise correct Cloud Run deployment fail readiness.

Current production server now resolves the port through `server/runtimePort.ts`:

- defaults to 3000 outside managed runtimes;
- honors an injected decimal port;
- rejects malformed, zero or out-of-range ports fail-closed.

The canonical CI production smoke starts the real built server with `PORT=3187`, polls `http://127.0.0.1:3187/api/health`, and requires startup logs to confirm `0.0.0.0:3187`.

This proves the runtime PORT contract locally in the CI environment. It does **not** prove Cloud Run is provisioned or deployed.

## What is integrated on the hardening branch

### Truth / evidence

- no hardcoded truth or consensus scores in the production truth path
- internal hash chains are integrity evidence, not external-world truth
- independent verifier works on snapshots
- Judge is non-mutating and fail-closed
- verdict vocabulary is restricted to:
  - `VERIFIED`
  - `BLOCKED_BY_MISSING_EVIDENCE`
  - `CONTRADICTED`
- runtime-required claims require explicitly allowed authoritative source kinds
- proof requirements can bind `operationId`, source revision and deployment revision
- operator rejection cannot become `VERIFIED` merely because its internal evidence chain is hash-valid
- memory cannot satisfy runtime proof requirements

### Consent / operator identity

- no auto-consent
- pending consent remains pending until explicit human action
- grant is bound to the exact `OperationSpec`
- server derives operator identity from a signed HttpOnly session
- client-supplied operator identity is not trusted
- missing operator authentication fails closed
- consent endpoint requires explicit intent header
- alert-dialog semantics, focus containment and least-destructive initial focus are enforced
- Escape maps to explicit rejection only for an authenticated operator able to make that decision

### Idempotency / failure recovery

- concurrent same-operation calls are deduplicated in-flight
- 50 parallel calls -> one apply regression
- readback-before-retry for mutating operations
- readback failure never authorizes a blind write
- conflicting target identity fails closed instead of overwriting
- transient provider failure and consent blockers do not poison the durable idempotency cache
- only observed durable success is cached as final

### Google Cloud proof surfaces prepared in code

- structured Cloud Run readback projection returns provider-observed identity fields when available and leaves unknown values null
- Firestore proof effect uses operation-bound write/readback
- Firestore effect binds mission, operation, parameters hash and exact source revision
- real Firestore execution stays unavailable unless `PROOFFLEET_SOURCE_REVISION` is an exact lowercase 40-character Git SHA
- source revision participates in operation parameters/hash/identity and therefore consent binding
- GCP adapters remain honestly `NOT_PROVISIONED` without real provider configuration
- server now honors the managed-runtime `PORT` contract

No live Google Cloud success is claimed by this checkpoint.

## Current external boundary — live Google Cloud

There is no direct Google Cloud/GCP connector available in the current ChatGPT tool session.

Therefore the next live proof lane must use a real Google-authenticated boundary rather than pretending local adapter tests are cloud evidence.

Preferred design:

1. GitHub Actions uses Google Workload Identity Federation rather than a long-lived service-account key;
2. deployment is manual/explicit (`workflow_dispatch`) until the live path is stable;
3. exact source head is authenticated and built;
4. Cloud Run deploy/readback proves service + revision identity;
5. deployment injects exact `PROOFFLEET_SOURCE_REVISION`;
6. runtime service account receives only required Firestore permissions;
7. Firestore target is provisioned;
8. human operator explicitly approves one real ProofFleet operation through the deployed UI/API;
9. Firestore write occurs through the normal OperationExecutor path;
10. authoritative Firestore readback becomes evidence;
11. Judge emits `VERIFIED` only if that operation-bound authoritative readback satisfies the proof requirement.

Do not auto-approve a demo operation from CI. Infrastructure deployment may be automated; human consent for the ProofFleet effect remains human.

A one-time owner-side GCP bootstrap may be required to create the Workload Identity Federation provider/service account and IAM bindings. Do not guess project ID, region, provider name or service-account identity. Resolve them from the real GCP account before enabling the workflow.

## Working method to continue with

This method produced the current checkpoint and remains mandatory.

### 1. Secure first

Before switching task, context, agent or tool:

1. push/write the current coherent change set to the feature branch;
2. read back exact PR/branch head;
3. confirm `main` has not moved unexpectedly;
4. run/read remote CI for that candidate;
5. record source-head vs synthetic-merge identity explicitly;
6. write/update this handoff when a meaningful P0 boundary closes.

Never continue merely because a write call returned success.

### 2. Evidence before labels

Do not accept:

- green because a report says green;
- failed because a wrapper says failed;
- verified because hashes match;
- deployed because an internal field says deployed;
- cloud-ready because an adapter unit test passes.

Trace every important result to its producing source and authoritative readback boundary.

### 3. One causal error family at a time

When CI/runtime turns red:

1. fetch exact failing job/log;
2. identify first causal family;
3. patch only that family;
4. add regression that would have failed before patch;
5. push;
6. rerun same remote lane;
7. do not begin unrelated work until the lane is understood.

Error families already found with this method include:

- TypeScript union narrowing
- Firestore identity serialization
- blind write after unavailable readback
- operation identity conflict overwrite
- poisoned idempotency cache after consent/provider failure
- integrity-only VERIFIED after human rejection
- inaccessible rejected-consent path
- cross-mission Judge contamination
- focus-trap inference failure
- ambiguous source-head vs tested-merge CI identity
- Cloud Run hardcoded-port incompatibility

### 4. Runtime and unit truth stay separate

Unit doubles are allowed only in tests.

Unit adapter tests prove contracts; they do not prove provider provisioning.
Production HTTP smoke proves the built server starts and checked endpoints behave on the runner; it does not prove external GCP effects.
A Cloud Run or Firestore claim requires real provider readback.

### 5. Every fix gets a regression

No bug fix is accepted only as a source edit.

Regression examples:

- no blind write if readback unavailable
- no overwrite on operation identity conflict
- same operation ID can recover after later consent/provider recovery
- source revision changes operation identity
- human rejection cannot become VERIFIED
- mission A cannot contaminate mission B Judge truth
- consent dialog focus cannot escape policy
- injected runtime port is honored
- source branch SHA and tested merge SHA cannot be conflated

### 6. Fail closed on missing evidence

If ProofFleet cannot prove an effect from an allowed authoritative source, remain:

`BLOCKED_BY_MISSING_EVIDENCE`

Never manufacture a success fallback.

## Next work — ordered

### P0 — live Google Cloud proof path

1. resolve real GCP project/region and existing AI-Studio deployment identity if one exists;
2. prepare/verify Workload Identity Federation bootstrap with minimal IAM;
3. add a manual deploy/readback workflow bound to an exact source head;
4. deploy ProofFleet to Cloud Run with exact source revision environment binding;
5. read back Cloud Run service and latest ready revision;
6. provision/verify Firestore + runtime IAM;
7. run one real operation after explicit human consent;
8. read back exact Firestore document identity;
9. project provider readback into Evidence/Receipt chain;
10. require Judge VERIFIED only from the matching authoritative readback.

### P1 — Pub/Sub event ingress

After the live Cloud Run + Firestore causal loop is stable, wire a real Pub/Sub event/correlation identity into mission evidence.

### P1 — remaining Google track services

Only after the core proof path is stable, evaluate/provision ADK/agent runtime, registry, memory, identity/gateway, Model Armor and observability surfaces that materially improve the judged demo.

No managed-service claim without actual provision + readback.

## Merge rule

Keep PR #1 draft until at minimum:

- current branch head CI is green with immutable lock
- authenticated consent production HTTP E2E is green
- source-head and tested-merge receipts are unambiguous
- runtime honors managed Cloud Run PORT
- at least one real Google Cloud mutating effect is proven by authoritative readback
- no production truth path uses mocks/fakes
- final demo path shows claim -> operation -> consent -> effect -> readback -> evidence -> Judge causally

`main` must not be merged merely because local/unit architecture is strong.

## Resume instruction

On resume:

1. read PR metadata/current head;
2. read latest workflow run/jobs/log;
3. read this handoff;
4. read files/tests touched by the next P0;
5. state the exact revision being resumed and current runtime evidence;
6. take exactly one next causal change;
7. regression-test, push and read back remote evidence before proceeding.
