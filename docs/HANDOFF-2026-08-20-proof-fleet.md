# ProofFleet Engineering Handoff — 2026-08-21

Status: **repo-side hardening checkpoint complete; next boundary is explicit live-cloud activation**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Last fully verified source head before this handoff-only commit: `c54a01cb2dbae4676a24499728869c549a3d0d7b`  
Synthetic PR merge SHA tested by GitHub: `55846cf7055b77342fe6429df0908231f6c7051a`  
GitHub Actions run: `32424591904` / run number `221`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

This handoff update advances the branch head. Before any further code or cloud mutation: re-read PR #1, record the new source head, and require CI for that exact head.

---

# 1. Exact verified checkpoint

Run #221 is fully green for source head:

```text
c54a01cb2dbae4676a24499728869c549a3d0d7b
```

Remote evidence from the same run:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit`
- **32 test files passed**
- **167 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- production HTTP runtime smoke passed
- authenticated consent HTTP E2E passed
- exact Docker image built and started with `PORT=8080`
- container `/api/health` readback passed
- high/critical dependency audit passed
- source head and GitHub synthetic merge SHA recorded separately
- `actions/checkout@v7` and `actions/setup-node@v7` executed successfully
- previous GitHub warning about deprecated Node.js 20 action runtimes is absent from the Run #221 verify log
- application runtime remains Node.js 22; only the GitHub Action internals moved to Node 24

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "c54a01cb2dbae4676a24499728869c549a3d0d7b",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "55846cf7055b77342fe6429df0908231f6c7051a",
  "testedMergeSha": "55846cf7055b77342fe6429df0908231f6c7051a"
}
```

Dependency truth:

- `npm audit --audit-level=high` exits successfully
- **0 high / 0 critical** findings
- remaining upstream findings are low/moderate only
- ADK high/critical transitives remain pinned to patched versions:

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

Current contract:

- dependency: `@google/adk ^1.6.0`
- model: `gemini-3.7-flash`
- provider provenance: `google-adk`
- `FleetRunner` retains a narrow LLM-provider boundary
- `server/gemini.ts` executes real ADK `LlmAgent + Runner + InMemorySessionService`
- each invocation uses an isolated ADK session
- input role is explicit `user`
- only final ADK responses are accepted
- missing final response fails closed
- no direct `GoogleGenAI` execution path remains

Authority separation:

- ADK receives no tools
- ADK cannot execute effects
- ADK cannot grant/infer consent
- ADK cannot mutate evidence
- ADK cannot act as Verifier or Judge
- Orchestrator/Scout output is `AGENT_OUTPUT`, never provider truth
- Scout remains ungrounded until a real source tool exists

Key compatibility:

- accepts `GOOGLE_API_KEY` or legacy AI-Studio `GEMINI_API_KEY`
- both present but different => fail closed
- legacy-only key may be process-locally aliased for ADK
- key values are never logged or persisted in receipts

---

# 4. ADK runtime-canary — repo-side CLOSED; live network observation PENDING

Core files:

```text
server/adkCanary.ts
server/adkCanaryController.ts
scripts/adk-live-canary.ts
src/components/AdkRuntimeCanaryPanel.tsx
```

Safety contract:

- fresh random challenge
- exact Gemini echo required
- receipt stores hashes + safe identities only
- no raw prompt/challenge/response/credential persistence
- exact lowercase 40-character source SHA required before provider call
- missing provider, empty final response, challenge mismatch and weak nonce fail closed
- concurrent triggers deduplicate
- observed receipt memoizes for the runtime process
- raw provider errors are sanitized

Status vocabulary:

```text
NOT_RUN
RUNNING
OBSERVED
FAILED
```

`OBSERVED` proves only that this exact source-bound runtime process completed the bounded ADK -> Gemini challenge/response. It does not prove a deployment effect, mission result or final verdict.

HTTP / operator authority:

- `GET /api/runtime/adk-canary` is read-only
- `POST /api/runtime/adk-canary` requires `X-ProofFleet-Canary-Intent: 1`
- POST reuses the signed HttpOnly operator session
- server owns operator identity
- ineligible source binding prevents provider call

UI contract:

- same operator authentication flow as consent
- password exists only in component state and is cleared after authentication
- no browser storage / JS cookie access
- Canary POST contains no body, token, operator identity or API key
- request uses same-origin session + explicit intent header only
- 401 clears local authenticated state
- UI says `ADK_RUNTIME_OBSERVED`, never `VERIFIED`
- unbound runtime displays `SOURCE BINDING REQUIRED`

---

# 5. Cloud Run zero-traffic candidate lane — repo-side CLOSED; live execution PENDING

Workflow:

```text
.github/workflows/gcp-deploy-candidate.yml
```

Safety contract:

- exact source SHA, never synthetic merge SHA
- WIF only; no service-account JSON key
- immutable Artifact Registry digest
- new candidate receives **0% normal traffic**
- source-SHA-derived candidate tag
- existing runtime service account and upstream env names must be preserved
- provider must report Ready + exact source + exact digest
- tagged candidate must pass `/api/health`
- workflow may only GET canary state; it never triggers Gemini
- candidate receipt can state `adkCanaryEligible=true` when source binding matches
- `adkCanaryObserved` remains false until a real operator-triggered observation exists

No Candidate deploy has been executed by this engineering lane yet.

---

# 6. Promotion lane — repo-side CLOSED; live execution PENDING

Workflow:

```text
.github/workflows/gcp-promote-candidate.yml
```

Before any traffic mutation it requires:

- explicit owner trigger
- exact source-derived candidate tag
- candidate remains at 0% normal traffic
- provider Ready
- exact source label and declared source env
- unchanged runtime service account
- immutable expected Artifact Registry digest
- fresh candidate `/api/health`
- runtime canary status exactly `OBSERVED`
- canary source SHA exactly equals promotion source SHA
- framework exactly `google-adk`
- model exactly `gemini-3.7-flash`
- valid matching challenge/response SHA-256 values
- `challengeMatched=true`
- `finalResponseObserved=true`

Only then may it move the exact revision to 100% traffic.

After traffic change it still requires authoritative provider readback and promoted service `/api/health`; failures attempt rollback to the prior traffic snapshot.

Promotion never creates revisions, builds images, touches Firestore or triggers the ADK canary.

No Promotion has been executed by this engineering lane yet.

---

# 7. Consent / idempotency / evidence boundaries — repo-side CLOSED

Consent:

- no auto-consent
- pending remains pending until explicit human decision
- consent bound to exact `OperationSpec`
- signed short-lived HttpOnly operator session
- client cannot assert operator identity
- authenticated production consent E2E green
- forged request/decision/operator cases covered

Idempotency / ambiguous writes:

- same-operation in-flight deduplication
- 50 concurrent calls -> exactly one apply
- readback-before-retry mandatory
- unavailable readback never authorizes blind write
- conflicts fail closed
- transient failures do not poison final cache
- only readback-observed durable success becomes final cached state

Evidence / Judge:

- hashes prove integrity, not external truth
- memory cannot satisfy runtime proof
- runtime mocks/fakes cannot satisfy production evidence
- rejected consent cannot become VERIFIED
- mission verdict is scoped to exact mission evidence/receipts
- exact verdict enum only:

```text
VERIFIED
BLOCKED_BY_MISSING_EVIDENCE
CONTRADICTED
```

---

# 8. Real Google Cloud truth already observed

Provider observations already established:

- project ID: `project-b29d4703-a302-4b05-b2e`
- project number: `511695074775`
- Cloud Run service: `prooffleet`
- region: `europe-west1`
- original observed AI-Studio revision: `prooffleet-00001-6rc`
- original revision did **not** expose `PROOFFLEET_SOURCE_REVISION`
- therefore original live AI-Studio service is not evidence for the hardened GitHub branch
- existing runtime identity: `511695074775-compute@developer.gserviceaccount.com`
- Firestore `(default)` database does not exist
- no Firestore location has been selected

Deploy bootstrap:

```text
scripts/bootstrap-gcp-deploy.sh
tests/gcp-deploy-bootstrap.test.ts
```

A real bootstrap **dry-run** completed and explicitly reported no IAM, Artifact Registry, Cloud Run, traffic or Firestore mutation.

Cloud Shell is not the normal user path. Prefer GitHub automation and minimal Google Cloud Console UI actions where unavoidable.

---

# 9. CI action-runtime hygiene — CLOSED

Run #221 proves:

- `actions/checkout@v7`
- `actions/setup-node@v7`
- application runtime still Node.js 22
- verification job keeps explicit npm cache
- privileged lock-reconciliation job disables automatic npm caching
- dependency-audit job disables automatic npm caching
- the former Node.js 20 GitHub Action deprecation warning is absent

Regression:

```text
tests/ci-action-runtime.test.ts
```

This test prevents old checkout/setup-node majors from returning and preserves the cache boundary.

---

# 10. Exact next boundary — LIVE CLOUD ACTIVATION

Repo-side preparation is now strong enough that the next useful evidence is provider-side, not another simulated local layer.

Before any live mutation:

1. verify or provision the dedicated GitHub WIF deployment identity;
2. verify or provision Artifact Registry repository `prooffleet`;
3. keep the existing Cloud Run runtime identity unchanged until separately reviewed;
4. configure GitHub repository variables required by candidate/promotion workflows;
5. explicitly decide to create one **0%-traffic candidate revision** from one exact green source head.

Then, and only then:

6. deploy exact green source head as zero-traffic candidate;
7. provider-readback revision, digest, source SHA, runtime identity, tag URL and `/api/health`;
8. use the ProofFleet UI/operator session to trigger one real ADK/Gemini canary on that tagged candidate;
9. read back `ADK_RUNTIME_OBSERVED`;
10. do **not** promote until the explicit promotion decision is separately made.

Do not set candidate/promotion labels or trigger a workflow that mutates GCP without an explicit live-mutation decision.

Repository Variables expected by the prepared workflows:

```text
PROOFFLEET_GCP_PROJECT_ID=project-b29d4703-a302-4b05-b2e
PROOFFLEET_GCP_REGION=europe-west1
PROOFFLEET_GCP_WIF_PROVIDER=projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo
PROOFFLEET_GCP_DEPLOY_SERVICE_ACCOUNT=prooffleet-deploy@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com
PROOFFLEET_CLOUDRUN_SERVICE=prooffleet
PROOFFLEET_ARTIFACT_REPOSITORY=prooffleet
```

These are configuration identities, not secrets.

---

# 11. Remaining hackathon P0s after first live candidate

1. live source-bound ADK/Gemini observation;
2. live 8-agent end-to-end mission canary;
3. one explicitly consented external effect with authoritative provider readback;
4. explicit Firestore location decision before database creation;
5. negative live demos:
   - success claim without provider proof -> `BLOCKED_BY_MISSING_EVIDENCE`
   - provider contradiction -> `CONTRADICTED`
   - ambiguous write -> no duplicate apply
6. synchronized final evidence report from exact submission commit;
7. Devpost architecture/demo/write-up using observed facts only;
8. PR review/main merge only after live evidence gates are green.

---

# 12. Mandatory engineering loop

1. choose one highest-value causal/runtime gap;
2. re-read exact PR head;
3. make one coherent change set;
4. add a regression for the property;
5. push/write branch;
6. re-read exact source head and unchanged `main` base;
7. read Actions for that exact source head;
8. if red, read the first failing job/log;
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
- Cloud Run candidate is deployed from exact source SHA and read back with matching immutable digest;
- at least one real provider effect is proven by authoritative readback;
- final demo mission reaches VERIFIED only through required real evidence;
- no production truth path uses mocks/fakes;
- Devpost claims match final observed services/model/runtime.

Do not submit Devpost or merge `main` merely because repo-side architecture is strong.
