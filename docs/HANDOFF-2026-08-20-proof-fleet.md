# ProofFleet Engineering Handoff — 2026-08-21

Status: **Google ADK + Grounding Evidence P0 repo-side closed; live Google provider provisioning still pending**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Last fully verified source head before this handoff-only commit: `d199e974682305337194763454239eeda741e540`  
Synthetic PR merge SHA tested by GitHub: `a68464a18d3509e0449384431d1762629480ebc3`  
GitHub Actions run: `32442716084` / run number `233`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

This documentation update advances the branch head. Before further code or cloud mutation, re-read PR #1 and require CI for the exact new source head.

---

# 1. Exact verified checkpoint

Run #233 is fully green for source head:

```text
d199e974682305337194763454239eeda741e540
```

Remote evidence from the same run:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit`
- **35 test files passed**
- **181 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- production HTTP runtime smoke passed
- authenticated consent HTTP E2E passed
- exact Docker image built and started with `PORT=8080`
- container `/api/health` readback passed
- high/critical dependency audit passed
- source head and GitHub synthetic merge SHA recorded separately

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "d199e974682305337194763454239eeda741e540",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "a68464a18d3509e0449384431d1762629480ebc3",
  "testedMergeSha": "a68464a18d3509e0449384431d1762629480ebc3"
}
```

Dependency truth:

- `npm audit --audit-level=high` exits successfully
- **0 high / 0 critical** findings
- remaining findings are **6 low / 19 moderate**, currently in the Google ADK/upstream dependency graph
- the audit gate was not weakened

---

# 2. Core authority model

ProofFleet is an evidence-first multi-agent control loop.

```text
mission
-> Google ADK + Gemini reasoning
-> deterministic role delegation
-> explicit operation-bound consent
-> bounded external effect
-> authoritative provider readback
-> evidence + receipts
-> independent verifier
-> non-mutating Judge
-> VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED
```

Eight core roles remain:

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
agent output != authoritative provider readback
grounding observation != Judge verdict
ADK_RUNTIME_OBSERVED != mission VERIFIED
```

---

# 3. Google ADK reasoning path — CLOSED repo-side

Current contract:

- dependency: `@google/adk ^1.6.0`
- model: `gemini-3.7-flash`
- provider provenance: `google-adk`
- `server/gemini.ts` executes real ADK `LlmAgent + Runner + InMemorySessionService`
- ADK receives no tools and no execution/consent/evidence/Judge authority
- Orchestrator and Scout output remains `AGENT_OUTPUT`
- missing final response fails closed
- conflicting `GOOGLE_API_KEY` / legacy `GEMINI_API_KEY` fails closed
- credentials are never placed in receipts

The source-bound ADK runtime-canary contract is also repo-side closed, but no real live network observation is claimed yet.

---

# 4. Google Agent Search Grounding Evidence Lane — P0 CLOSED

New core file:

```text
server/evidence/grounding.ts
```

Provider contract:

```text
AgentSearchEvidenceProvider
provider = google-agent-search
retrievalMode = OWN_DATA
```

Grounding state vocabulary:

```text
NOT_CONFIGURED
READY
OBSERVED
FAILED
```

Current production runtime intentionally uses:

```text
createUnconfiguredAgentSearchEvidenceProvider()
```

Therefore the live server currently reports **NOT_CONFIGURED** and performs:

- no Google Agent Search request
- no grounded-generation request
- no credential access
- no billable grounding action

Read-only endpoint:

```text
GET /api/evidence/grounding/status
```

There is intentionally **no Grounding POST route** in P0.

---

# 5. GroundingReceipt truth contract

Schema:

```text
prooffleet.grounding.v1
```

A durable `GROUNDING_OBSERVED` receipt binds:

- mission ID
- exact 40-character source revision
- provider `google-agent-search`
- retrieval mode `OWN_DATA`
- source kind `AGENT_SEARCH_READBACK`
- SHA-256 of the query
- SHA-256 identities of source reference, document ID and chunk ID
- source ranking
- whether generation was observed
- SHA-256 of generated response if present
- citation count
- observation timestamp
- canonical receipt SHA-256

Raw query text, raw retrieved source identifiers and raw generated response are not persisted in the receipt.

Receipt verification proves only:

> the grounding receipt is structurally valid and its hash recomputes.

It explicitly does **not** prove the factual claim contained in or derived from the provider output.

Judge remains the only final verdict authority.

---

# 6. Grounding adversarial regressions — CLOSED

Core tests:

```text
tests/grounding-evidence.test.ts
tests/grounding-ui-contract.test.ts
tests/fixtures/mockAgentSearchProvider.ts
```

The mock provider exists under `tests/` only; runtime code imports no mock/fake/stub.

Run #233 proves:

- unconfigured provider => `NOT_CONFIGURED`
- no retrieval call occurs while unconfigured
- raw query/source IDs/generated text are absent from durable receipt
- receipt hash independently recomputes
- tampering is detected
- malformed source revision fails
- a source-less grounding observation fails
- upstream provider errors are sanitized
- a valid grounding receipt by itself still leaves Judge at `BLOCKED_BY_MISSING_EVIDENCE`
- the server exposes only a read-only Grounding status route
- UI cannot call a cost-triggering Grounding route
- Grounding code/panel contains no Google/Gemini credential material

---

# 7. Grounding UI — CLOSED repo-side

New component:

```text
src/components/GroundingEvidencePanel.tsx
```

`App.tsx` polls:

```text
/api/evidence/grounding/status
```

UI vocabulary:

```text
GROUNDING_OBSERVED
GROUNDING_READY
GROUNDING_FAILED
NOT_CONFIGURED
```

Critical copy:

> Google Agent Search retrieval evidence. A grounding observation is evidence input, not a Judge verdict.

The UI contains no action button that can start Agent Search or incur a provider request in P0.

---

# 8. Real Google Cloud truth currently observed

Known provider facts:

- project ID: `project-b29d4703-a302-4b05-b2e`
- project number: `511695074775`
- Cloud Run service: `prooffleet`
- region: `europe-west1`
- original AI-Studio revision observed earlier: `prooffleet-00001-6rc`
- original revision did not expose `PROOFFLEET_SOURCE_REVISION`
- existing runtime identity: `511695074775-compute@developer.gserviceaccount.com`
- Firestore `(default)` database does not exist
- no Firestore location has been selected

No Firestore database/location should be silently created.

---

# 9. Candidate deployment truth — blocked at real WIF provider gate

Candidate workflow:

```text
.github/workflows/gcp-deploy-candidate.yml
```

The candidate target identity is now revision-bound in the workflow rather than depending on six mutable GitHub repository variables.

Real trigger attempts established three distinct facts:

1. initial run failed closed before auth because target variables were absent;
2. the next run exposed and then fixed an unbound `GITHUB_EVENT_ACTION` workflow bug;
3. after that fix, preflight passed and the workflow reached **real Google WIF authentication**.

The real provider result was:

```text
invalid_target
```

Google reported that the WIF target pool/provider is disabled, deleted or does not exist.

Expected provider resource:

```text
projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo
```

Therefore current truthful state is:

```text
WIF_PROVIDER = NOT_PROVISIONED / NOT_REACHABLE
CANDIDATE_IMAGE_PUSH = NOT_EXECUTED
CLOUD_RUN_CANDIDATE_REVISION = NOT_CREATED_BY_THIS_LANE
TRAFFIC_MUTATION = NOT_EXECUTED
```

The deploy label was removed after the failed run.

---

# 10. Google GenAI App Builder promotional credit

The billing account shows a user-observed promotional credit:

```text
Trial credit for GenAI App Builder
EUR 835.80
100% unused at discovery time
valid through 2027-02-23
```

Do not assume this credit covers arbitrary Cloud Run, Firestore, Artifact Registry or Gemini usage.

Planned safe use is an Agent Search / own-data grounding lane, but actual SKU eligibility must later be proven by a deliberately tiny billing canary and billing-credit readback before scaling usage.

P0 consumed no Agent Search provider usage and makes no billing claim.

---

# 11. Exact next repo-only work possible without user cloud interaction

Before provisioning Agent Search, code can still be prepared autonomously:

1. verify the current official Google Agent Search API/auth contract;
2. implement a **disabled-by-default real provider adapter** behind `AgentSearchEvidenceProvider`;
3. require explicit datastore/serving-config identity before the adapter can become `READY`;
4. use injected transport/auth in tests so CI performs no Google request;
5. ensure provider response projection retains only required source identities and generated text long enough to hash it;
6. keep all real provider calls impossible while configuration is incomplete;
7. add request-budget/canary controls before exposing any live Grounding trigger.

Only after that should real Google Agent Search provisioning be considered.

---

# 12. Live-cloud work still pending

Provider-side work remains blocked until Google Cloud trust/provisioning can be performed without unsafe guesswork:

- create/verify WIF pool + provider for GitHub if candidate deployment is resumed;
- create/verify dedicated deployment service account and least-privilege bindings;
- Artifact Registry candidate path;
- exact zero-traffic Cloud Run candidate;
- source/digest/runtime/tag/health readback;
- real source-bound ADK/Gemini canary;
- explicit Firestore location decision before DB creation;
- one real provider effect + authoritative readback;
- final live mission proof.

No `main` merge, traffic promotion, Firestore creation/write or Devpost final submission should occur merely because repo-side tests are green.

---

# 13. Mandatory engineering loop

1. choose one highest-value causal/runtime gap;
2. re-read exact PR head;
3. make one coherent change set;
4. add a regression for the property;
5. write/push the branch;
6. re-read exact source head and unchanged `main` base;
7. read Actions for that exact source head;
8. if red, read first failing job/log only;
9. fix only that causal error family;
10. repeat until remote CI is green and understood;
11. keep provider/live evidence separate from unit evidence;
12. update this handoff at meaningful P0 boundaries.

Never manufacture a success fallback.

---

# 14. Merge / submission rule

Keep PR #1 Draft and keep `main` unchanged until at minimum:

- exact source head has green CI and Docker runtime smoke;
- a real networked ADK/Gemini canary is observed on an exact source-bound runtime;
- a Cloud Run candidate is deployed from exact source SHA and read back with matching immutable digest;
- at least one real provider effect is proven by authoritative readback;
- final demo mission reaches VERIFIED only through required real evidence;
- no production truth path uses mocks/fakes;
- Devpost claims match final observed services/model/runtime.
