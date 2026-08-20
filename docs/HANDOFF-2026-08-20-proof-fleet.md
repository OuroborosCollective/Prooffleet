# ProofFleet Hardening Handoff — 2026-08-20

Status: **checkpoint / Gemini truth contract closed / live GCP proof prepared but NOT executed**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`

## Last fully verified code checkpoint

Source head:

```text
ac27410b85d1fe9cdfed4c4b1ba08550e323c9c6
```

GitHub synthetic merge SHA tested for that source head:

```text
8c7ea390b817d385db2e31d31ab6e6332ba67990
```

GitHub Actions:

```text
run id:     32329696756
run number: 105
```

Remote evidence from that one run:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit` passed
- **24 test files passed**
- **99 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- real production-server HTTP smoke passed on injected `PORT=3187`
- authenticated consent production HTTP E2E passed
- high/critical dependency audit passed
- package-lock bootstrap skipped because lock already exists
- CI revision receipt separated branch source head from GitHub synthetic merge SHA

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "ac27410b85d1fe9cdfed4c4b1ba08550e323c9c6",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "8c7ea390b817d385db2e31d31ab6e6332ba67990",
  "testedMergeSha": "8c7ea390b817d385db2e31d31ab6e6332ba67990"
}
```

After that verified code checkpoint, `README.md` was documentation-only updated to describe the proven Gemini runtime contract. This handoff update is also documentation-only. Therefore the branch head after this file must receive its own CI readback before any later work is called current-green.

---

# Closed P0 — Gemini / manifest truth

Canonical runtime contract:

```text
provider: google-genai (@google/genai)
model:    gemini-3.6-flash
```

Only the real LLM-backed roles advertise Gemini:

- `orchestrator` -> `gemini-3.6-flash`
- `scout` -> `gemini-3.6-flash`

The other six core roles are explicitly:

```text
deterministic-runtime
```

Current eight-role manifest IDs:

```text
orchestrator
scout
builder
analyst
sentinel
auditor
gatekeeper
operator
```

Permission truth is aligned with runtime enforcement:

```text
orchestrator: read, verify
scout:        read, verify
builder:      read, write, execute
analyst:      read, verify
sentinel:     read, verify
auditor:      read, verify
gatekeeper:   read, consent_gate
operator:     read, write, execute
```

Authority boundaries are explicit:

- Orchestrator plans; it cannot issue the final truth verdict.
- Scout may use Gemini for context, but Gemini-only context is explicitly **ungrounded** and cannot manufacture citations.
- Builder prepares artifacts/work but cannot certify external effects.
- Analyst computes deterministic metrics and does not manufacture confidence/truth scores.
- Sentinel checks security/permission surfaces and cannot grant consent.
- Auditor inspects integrity and cannot replace the Judge.
- Gatekeeper requests exact-operation consent and cannot execute the operation.
- Operator executes an approved effect and projects authoritative readback provenance; it cannot judge itself.
- Independent Judge remains the final non-mutating verdict authority.

Gemini output provenance is now explicit:

- Orchestrator planning narrative is `AGENT_OUTPUT` plus provider/model/output SHA-256.
- Scout Gemini context is `AGENT_OUTPUT`, `grounded=false`, no invented citations, plus provider/model/output SHA-256.
- Only a real grounding tool may produce grounded citations.
- Missing Gemini provider creates an explicitly marked deterministic fallback.
- A configured provider failure propagates as a real failure instead of silently becoming a fallback success.

Regression family:

`tests/gemini-model-truth.test.ts`

The suite proves:

1. canonical model is `gemini-3.6-flash`;
2. stale `gemini-3.7` runtime/manifest literals are absent;
3. only Orchestrator + Scout advertise Gemini;
4. manifest roles and permissions match the enforced fleet;
5. non-Judge roles do not receive verdict/score authority;
6. Orchestrator model output is hashed and marked `AGENT_OUTPUT`;
7. Scout Gemini context remains ungrounded without real sources;
8. configured provider failures are not hidden by fallback.

Production CI additionally rejects any future `gemini-3.7*` literal under `server/` or `src/` through the `UNSUPPORTED_GEMINI_MODEL` truth guard.

---

# Other closed hardening boundaries

## Consent / operator identity

- no auto-consent
- pending consent remains pending until explicit human action
- exact `OperationSpec` binding
- signed short-lived HttpOnly operator session
- identity derived server-side
- client identity cannot override operator identity
- intent header required
- REJECTED decision can be authentic while remaining invalid for execution
- forged request IDs / forged operator identities rejected
- production consent HTTP E2E green
- modal alert-dialog/focus containment/least-destructive focus regression-tested

## Idempotency / ambiguous writes

- same-operation in-flight deduplication
- regression: 50 concurrent calls -> exactly one apply
- authoritative readback before mutation/retry
- unavailable readback never authorizes blind write
- conflicting existing operation identity never gets overwritten
- consent/provider failures do not poison durable idempotency cache
- only readback-observed durable success is cached final

## Evidence / Judge

- hash chain = integrity, not external truth
- Memory cannot satisfy runtime evidence
- runtime doubles cannot satisfy production truth
- final verdict vocabulary restricted to:
  - `VERIFIED`
  - `BLOCKED_BY_MISSING_EVIDENCE`
  - `CONTRADICTED`
- rejected consent cannot become VERIFIED through integrity alone
- final Judge input is mission-scoped, while global ledger integrity remains globally chained
- previous missions cannot contaminate later verdicts

## CI / reproducibility

- committed `package-lock.json`
- `npm ci` canonical install path
- canonical `npm run verify:ci`
- source-head vs synthetic-merge receipt explicit
- README contains reproducible clone/install/test/start instructions
- Cloud Run runtime `PORT` contract regression-tested and real CI runtime smoke uses `PORT=3187`

---

# Manual live Google Cloud proof lane — prepared, NOT executed

Workflow:

```text
.github/workflows/gcp-live-proof.yml
```

Safety contract already regression-tested in normal PR CI:

- `workflow_dispatch` only
- never runs on push/pull request
- `contents: read`
- `id-token: write`
- `google-github-actions/auth@v3`
- Workload Identity Federation / OIDC
- no long-lived service-account JSON key
- exact source revision = `${{ github.sha }}`
- Firestore mutation requires exact manual phrase:

```text
I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE
```

Required repository variables:

```text
PROOFFLEET_GCP_PROJECT_ID
PROOFFLEET_GCP_REGION
PROOFFLEET_GCP_WIF_PROVIDER
PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT
PROOFFLEET_CLOUDRUN_SERVICE
PROOFFLEET_FIRESTORE_COLLECTION
```

These real values are still unresolved in this ChatGPT session. Do not guess them.

Cloud Run proof requires its configured non-secret:

```text
PROOFFLEET_SOURCE_REVISION
```

to equal the exact workflow source SHA before any Firestore proof write is authorized.

Live runner:

```text
scripts/gcp-live-proof.ts
```

Receipt:

```text
gcp-live-proof-receipt.json
```

Possible provider observation outcomes:

```text
OBSERVED
BLOCKED_BY_MISSING_EVIDENCE
CONTRADICTED
```

No live Google Cloud success has been claimed yet.

---

# Devpost state

Devpost project:

```text
https://devpost.com/software/prooffleet
```

Repository link registered:

```text
https://github.com/OuroborosCollective/Prooffleet
```

Submission remains **not final submitted**.

The reproducible-testing README requirement is now satisfied in the repository and can truthfully be answered **Yes** when the submission fields are finalized.

Still required before final submission:

- actual architecture diagram file (PDF/PPT/PPTX/PNG/JPG/JPEG)
- real Google Cloud deployment/readback proof
- exact Cloud Run / Firestore service selections based on actual use
- real Gemini provider exercise in the deployed demo
- ~4 minute demo video showing the Google Cloud backend
- final text write-up / learnings
- final mandatory submission fields

---

# Working method — keep this exact pattern

Before changing task, tool or context:

1. push/write one coherent change set;
2. read the exact PR head from GitHub;
3. confirm `main` did not unexpectedly move;
4. read remote CI for that exact candidate;
5. inspect actual jobs/logs, not only a badge;
6. preserve the distinction between source head and synthetic merge SHA;
7. update this handoff at meaningful P0 boundaries.

When CI/runtime turns red:

1. fetch the exact failing job/log;
2. identify the **first causal error family**;
3. patch only that family;
4. add a regression that would have failed before the patch;
5. push;
6. run/read the same remote lane again;
7. do not start unrelated work until that lane is understood.

Never accept `green`, `verified`, `deployed` or `cloud-ready` because a report/string says so.

If required provider evidence is unavailable, remain:

```text
BLOCKED_BY_MISSING_EVIDENCE
```

---

# Next work — exact order

## P0 — verify this documentation head

Read new PR head + its GitHub Actions run before calling this checkpoint current-green.

## P0 — Devpost architecture diagram

Build a technical architecture diagram that matches the actual runtime:

- React/TypeScript frontend
- Express backend
- Google GenAI SDK + `gemini-3.6-flash` only into Orchestrator + Scout
- remaining six deterministic roles
- explicit Gatekeeper consent
- Operator -> OperationExecutor -> Firestore
- Cloud Run authoritative deployment readback
- evidence/receipt chain
- independent verifier
- non-mutating Judge
- final three verdicts
- show planned/manual WIF live-proof boundary without falsely claiming it was executed

Render it to an allowed Devpost file format and upload only after inspecting the rendered artifact.

## P0 — resolve real GCP identity / WIF

Resolve real:

- project ID
- region
- WIF provider resource
- WIF service account
- Cloud Run service
- Firestore collection/database

Then set the six GitHub variables through an authorized owner/GCP surface. Do not replace this with a long-lived JSON key.

## P0 — live provider proof

Only after real identities are independently checked:

1. deploy/identify exact current source on Cloud Run;
2. verify Cloud Run declares the same source SHA;
3. manually dispatch the live-proof workflow with exact confirmation phrase;
4. read Cloud Run provider result;
5. execute one operation-bound Firestore proof write;
6. authoritative Firestore readback;
7. inspect the Actions artifact receipt;
8. only then connect provider observation to application Evidence/Receipt/Judge.

## P1 — Pub/Sub and managed Fortified surfaces

After Cloud Run + Firestore causal proof is stable, add/prove only the managed surfaces that materially improve judging: Pub/Sub, ADK/Agent Runtime, Registry, Memory Bank, Identity/Gateway, Model Armor, OpenTelemetry/Observability.

No managed-service claim without provision + readback.

---

# Merge rule

Keep PR #1 Draft until at minimum:

- current head has green immutable-lock CI;
- Gemini model/manifest truth remains green;
- authenticated consent production E2E remains green;
- source/tested revision identities remain unambiguous;
- at least one real Google Cloud mutating effect is proven by authoritative readback;
- no production truth path uses mocks/fakes;
- final demo can visibly trace:

```text
mission -> agent work -> consent -> effect -> readback -> evidence -> independent verification -> Judge
```

Do not merge `main` merely because the local/unit architecture is strong.
