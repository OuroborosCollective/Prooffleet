# ProofFleet Engineering Handoff — 2026-08-21

Status: **active checkpoint / continue current engineering loop**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Last fully verified source head before this handoff-only commit: `7c4ebd26456ca485be28beeee52c5c49068c2cbf`  
Synthetic merge SHA tested by GitHub: `d9ab4614dfd7d43e1f21cca45a945c94e3083002`  
GitHub Actions run: `32423846591` / run number `215`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

This file update advances the branch head. Re-read PR #1 and CI before changing code; do not call the handoff-only head green until its own CI is observed.

---

# 1. Exact current verified checkpoint

Run #215 is fully green for source head:

```text
7c4ebd26456ca485be28beeee52c5c49068c2cbf
```

Remote evidence from the same run:

- immutable dependency install through `npm ci`
- TypeScript `tsc --noEmit` passed
- **31 test files passed**
- **163 tests passed**
- production truth guards passed
- production Vite + esbuild build passed
- production HTTP runtime smoke passed
- authenticated consent production HTTP E2E passed
- exact Docker image built and started with Cloud Run `PORT=8080`
- container `/api/health` readback passed
- high/critical dependency audit passed
- source head and GitHub synthetic merge SHA recorded separately

Exact CI identity receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "7c4ebd26456ca485be28beeee52c5c49068c2cbf",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "d9ab4614dfd7d43e1f21cca45a945c94e3083002",
  "testedMergeSha": "d9ab4614dfd7d43e1f21cca45a945c94e3083002"
}
```

Dependency-audit truth on the current graph:

- `npm audit --audit-level=high` exits successfully
- **0 high / 0 critical** findings
- remaining known upstream findings are low/moderate only
- ADK high/critical transitives are pinned to patched versions with npm overrides rather than weakening the audit gate:

```json
{
  "adm-zip": "0.6.0",
  "tar": "7.5.22"
}
```

---

# 2. Product truth / authority model

ProofFleet is an evidence-first multi-agent control loop for autonomous engineering and enterprise-agent actions.

Core rule:

> An agent saying an action succeeded is not proof that the action happened.

Causal chain:

```text
mission
-> Google ADK + Gemini reasoning
-> deterministic role delegation
-> explicit operation-bound human consent
-> bounded external effect
-> authoritative provider readback
-> evidence + receipts
-> independent verifier
-> non-mutating Judge
-> VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED
```

Eight core roles:

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

Independent Verifier and Judge remain separate authorities.

Truth rules:

```text
planning != execution
execution != proof
memory != truth
hash integrity != external truth
agent success text != authoritative readback
unit evidence != live provider evidence
ADK_RUNTIME_OBSERVED != mission VERIFIED
```

---

# 3. Google ADK reasoning path — repo-side CLOSED

Google ADK is part of the real Orchestrator/Scout reasoning path rather than a decorative dependency.

Current runtime contract:

- dependency: `@google/adk ^1.6.0`
- model: `gemini-3.7-flash`
- provider provenance: `google-adk`
- `FleetRunner` keeps a narrow `LlmProvider` boundary
- `server/gemini.ts` executes a real ADK `LlmAgent + Runner + InMemorySessionService`
- each invocation creates an isolated ADK session
- input is explicit `role: "user"`
- only `isFinalResponse(event)` output is accepted
- missing final response fails closed
- no direct `GoogleGenAI` execution path remains

Authority boundary:

- ADK receives no tools
- ADK cannot execute external effects
- ADK cannot grant or infer consent
- ADK cannot mutate Evidence Ledger
- ADK cannot act as Independent Verifier or Judge
- Orchestrator/Scout output is `AGENT_OUTPUT`, never authoritative provider truth
- Scout remains explicitly ungrounded until a real source tool exists

Key compatibility:

- accepts `GOOGLE_API_KEY` or legacy AI-Studio `GEMINI_API_KEY`
- both present but different => fail closed
- legacy-only key may be aliased process-locally for ADK
- key value is never logged or placed into receipts

---

# 4. ADK live-canary contract — repo-side CLOSED, live network observation pending

Core files:

```text
server/adkCanary.ts
server/adkCanaryController.ts
scripts/adk-live-canary.ts
src/components/AdkRuntimeCanaryPanel.tsx
```

Safety and truth properties now enforced:

- fresh random challenge per process
- exact challenge echo required from Gemini
- receipt persists only hashes + safe identities
- raw prompt/challenge/response/API credential never persisted
- exact lowercase 40-char `PROOFFLEET_SOURCE_REVISION` required before provider call
- missing provider => fail closed
- empty final response => fail closed
- mismatch => fail closed
- weak nonce => fail closed before provider call
- concurrent triggers deduplicate into one provider call
- an observed receipt is memoized for that process
- raw provider errors are sanitized

Canary status vocabulary:

```text
NOT_RUN
RUNNING
OBSERVED
FAILED
```

`OBSERVED` means only:

> this exact source-bound runtime process completed the bounded Google ADK -> Gemini challenge/response.

It does **not** prove a deployment effect, Firestore effect, mission result or final Judge verdict.

---

# 5. Canary HTTP + operator UI authority — repo-side CLOSED

Server contract:

- `GET /api/runtime/adk-canary` is read-only
- `POST /api/runtime/adk-canary` requires `X-ProofFleet-Canary-Intent: 1`
- POST uses the existing signed HttpOnly operator session
- server owns operator identity
- no second authentication authority was created
- ineligible source binding prevents provider call

UI contract:

- `AdkRuntimeCanaryPanel` uses the same `handleOperatorAuthenticate` flow as consent
- operator token exists only in password component state
- successful authentication clears the local token state
- no `localStorage`, `sessionStorage` or JS cookie access
- Canary POST contains no body/token/operator identity/API key
- request carries only same-origin session + explicit intent header
- 401 clears local authenticated state
- UI says `ADK_RUNTIME_OBSERVED`, never `VERIFIED`
- unbound runtime is shown as `SOURCE BINDING REQUIRED`

Run #215 explicitly includes seven `adk-canary-ui` safety regressions for these properties.

---

# 6. Cloud Run candidate lane — repo-side CLOSED, live execution pending

Workflow:

```text
.github/workflows/gcp-deploy-candidate.yml
```

Safety contract:

- exact PR source SHA, never synthetic merge SHA
- WIF only; no service-account JSON key
- immutable Artifact Registry image digest
- new Cloud Run candidate with **0% normal traffic**
- source-SHA-derived candidate tag
- preserve existing runtime service account and upstream env names
- provider must report Ready + matching source SHA + matching digest
- exact tagged candidate URL must pass `/api/health`
- candidate workflow may only **GET** `/api/runtime/adk-canary`
- candidate workflow must never trigger the model canary itself
- candidate receipt records `adkCanaryEligible=true` only when source binding matches
- candidate receipt keeps `adkCanaryObserved=false` until a real operator-triggered observation exists

No Candidate deploy has been executed by this engineering lane yet.

---

# 7. Cloud Run promotion lane — repo-side CLOSED, live execution pending

Workflow:

```text
.github/workflows/gcp-promote-candidate.yml
```

Promotion is fail-closed behind all of these gates:

- explicit owner trigger
- exact source-derived candidate tag
- candidate still at 0% normal traffic
- provider Ready
- exact source label
- exact declared source env
- same runtime service account
- immutable expected Artifact Registry digest
- fresh `/api/health` on tagged candidate
- **runtime `GET /api/runtime/adk-canary` must return `OBSERVED`**
- canary receipt source SHA must equal requested promotion SHA
- framework must be `google-adk`
- model must be `gemini-3.7-flash`
- challenge and response hashes must both be valid SHA-256
- challenge/response hashes must match
- `challengeMatched=true`
- `finalResponseObserved=true`

Only after those checks may the lane execute:

```text
gcloud run services update-traffic <service> --to-revisions=<exact-revision>=100
```

After traffic change it still requires:

- authoritative 100% provider readback
- no other positive traffic target
- promoted service `/api/health`
- retained ADK observation in the promotion receipt

Any failed post-readback/health check attempts rollback to the prior traffic snapshot.

Promotion lane never builds images, creates revisions, touches Firestore or triggers the ADK canary.

No Promotion has been executed by this engineering lane yet.

---

# 8. Consent / idempotency / truth boundaries — CLOSED repo-side

## Consent and operator identity

- no auto-consent
- pending remains pending until explicit human decision
- consent bound to exact `OperationSpec`
- signed short-lived HttpOnly operator session
- client cannot assert operator identity
- forged request/decision/operator regressions
- authenticated production consent HTTP E2E green
- alertdialog/focus/Escape safety tested

## Idempotency and ambiguous writes

- same-operation in-flight deduplication
- 50 concurrent same-operation calls -> exactly one apply
- readback-before-retry mandatory
- unavailable readback never authorizes a blind write
- conflicting operation identity never overwritten
- transient failures do not poison final idempotency cache
- only readback-observed durable success is cached final

## Evidence and Judge

- hashes prove integrity, not world truth
- memory cannot satisfy runtime proof
- runtime mocks/fakes cannot satisfy production evidence
- rejected consent can never become VERIFIED
- mission verdict scoped to exact mission evidence/receipts
- verdict vocabulary only:

```text
VERIFIED
BLOCKED_BY_MISSING_EVIDENCE
CONTRADICTED
```

---

# 9. Real Google Cloud truth already observed

Authoritative provider observations already established outside repo-only tests:

- project ID: `project-b29d4703-a302-4b05-b2e`
- project number: `511695074775`
- Cloud Run service: `prooffleet`
- region: `europe-west1`
- original observed revision: `prooffleet-00001-6rc`
- original service was deployed by Google AI Studio
- original revision did **not** expose `PROOFFLEET_SOURCE_REVISION`
- therefore the original live service is **not** evidence for the hardened GitHub head
- existing runtime identity observed: `511695074775-compute@developer.gserviceaccount.com`
- Firestore `(default)` database does **not** exist
- no Firestore location has been selected by this lane

Deploy bootstrap:

```text
scripts/bootstrap-gcp-deploy.sh
tests/gcp-deploy-bootstrap.test.ts
```

A real bootstrap **dry-run** completed and explicitly reported that no IAM, Artifact Registry, Cloud Run, traffic or Firestore mutation occurred.

User-facing Cloud Shell is **not** part of the normal operating path. Prefer GitHub automation plus small Google Cloud Console UI actions when unavoidable.

---

# 10. Exact next P0

## P0-A — remove CI action-runtime deprecation before live-cloud work

Run #215 is green but its log reports that `actions/checkout@v4` and `actions/setup-node@v4` target deprecated Node.js 20 action runtimes and are currently being forced onto Node.js 24 by GitHub.

Do not ignore the warning indefinitely.

Next loop:

1. verify current official Node-24-ready action majors from the upstream GitHub Action repositories;
2. update only `.github/workflows/ci.yml` action majors;
3. add/extend regression ensuring deprecated action majors do not return;
4. push;
5. re-read exact source head;
6. require full remote CI green, including Docker smoke + audit + revision receipt.

This is CI hygiene, not a product truth change.

## P0-B — live-cloud activation after CI hygiene

After P0-A is green:

1. verify/provision dedicated GitHub WIF deployment identity and Artifact Registry with no long-lived key;
2. keep existing runtime identity unchanged until separately reviewed;
3. configure the repository variables already required by candidate/promotion workflows;
4. deploy one exact source head as a **0%-traffic candidate**;
5. read back revision, digest, source SHA, runtime identity, tag URL and HTTP health;
6. use the UI/operator session to run one real ADK/Gemini canary on that exact candidate;
7. read back `ADK_RUNTIME_OBSERVED` from the candidate;
8. only then consider explicit promotion.

Do **not** set candidate/promotion labels or trigger live mutation without an explicit live-mutation decision.

---

# 11. Still-open hackathon P0s after first live candidate

1. live source-bound ADK/Gemini observation on exact candidate;
2. live 8-agent end-to-end mission canary;
3. one explicitly consented external effect with authoritative provider readback;
4. explicit Firestore location decision before database creation;
5. negative live demos:
   - success claim without provider proof -> `BLOCKED_BY_MISSING_EVIDENCE`
   - provider contradiction -> `CONTRADICTED`
   - ambiguous write -> no duplicate apply
6. synchronized final evidence report from exact submission commit;
7. Devpost architecture/demo/write-up using only observed facts;
8. PR review/main merge only after live evidence gates are green.

---

# 12. Mandatory engineering loop

1. choose one highest-value causal/runtime gap;
2. read exact current PR head;
3. make one coherent change set;
4. add regression for the property;
5. push/write branch;
6. re-read exact PR head and unchanged `main` base;
7. read Actions for that exact source head;
8. if red, read first failing job/log;
9. fix only that causal error family;
10. repeat until remote CI is green and understood;
11. keep provider/live evidence separate from unit evidence;
12. update this handoff at meaningful P0 boundaries.

Never manufacture a success fallback.

---

# 13. Merge / submission rule

Keep PR #1 Draft and keep `main` unchanged until at minimum:

- exact source head has green CI and Docker runtime smoke;
- a real networked ADK/Gemini canary is observed on an exact source-bound runtime;
- candidate Cloud Run revision is deployed from exact source SHA and read back with matching immutable digest;
- at least one real provider effect is proven by authoritative readback;
- final demo mission reaches VERIFIED only through required real evidence;
- no production truth path uses mocks/fakes;
- Devpost claims match final observed services/model/runtime.

Do not submit Devpost or merge `main` merely because repo-side architecture is strong.
