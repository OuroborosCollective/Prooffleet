# ProofFleet Engineering Handoff — 2026-08-21

Status: **Google ADK + Agent Search grounding lane repo-side prepared; live provider usage remains disabled**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Last fully verified source head before this handoff-only commit: `3f16aeb99d73cee0ee5f54ad8b8acb5739cb8d5a`  
Synthetic PR merge SHA tested by GitHub: `664301b76e86a950fb36b2adf092d5a6cf159bed`  
GitHub Actions run: `32444308732` / run number `241`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

This documentation update advances the branch head. Before further code or cloud mutation, re-read PR #1 and require CI for the exact new source head.

---

# 1. Exact verified checkpoint

Run #241 is fully green for source head:

```text
3f16aeb99d73cee0ee5f54ad8b8acb5739cb8d5a
```

Remote evidence from the same run:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit`
- **37 test files passed**
- **197 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- production HTTP runtime smoke passed
- authenticated consent HTTP E2E passed
- exact Docker image built and started with `PORT=8080`
- container `/api/health` readback passed
- high/critical dependency audit passed
- source head and synthetic PR merge SHA recorded separately

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "3f16aeb99d73cee0ee5f54ad8b8acb5739cb8d5a",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "664301b76e86a950fb36b2adf092d5a6cf159bed",
  "testedMergeSha": "664301b76e86a950fb36b2adf092d5a6cf159bed"
}
```

Dependency truth:

```text
25 findings total
6 low
19 moderate
0 high
0 critical
```

The high/critical audit gate remains intact.

---

# 2. Core authority model

ProofFleet is an evidence-first multi-agent control loop:

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

Critical truth rules:

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

- dependency: `@google/adk ^1.6.0`
- model: `gemini-3.7-flash`
- provider provenance: `google-adk`
- real path uses `LlmAgent + Runner + InMemorySessionService`
- ADK receives no execution/consent/evidence/Judge authority
- Orchestrator and Scout output remains `AGENT_OUTPUT`
- malformed/missing final responses fail closed
- conflicting `GOOGLE_API_KEY` / `GEMINI_API_KEY` fails closed
- credentials are never placed in receipts

The source-bound ADK live-canary contract exists, but no real live network observation is claimed yet.

---

# 4. Agent Search Grounding Evidence Lane — CLOSED repo-side

Core contract:

```text
server/evidence/grounding.ts
```

Provider identity:

```text
provider = google-agent-search
retrievalMode = OWN_DATA
```

Grounding states:

```text
NOT_CONFIGURED
READY
OBSERVED
FAILED
```

Durable receipt schema:

```text
prooffleet.grounding.v1
```

A `GROUNDING_OBSERVED` receipt binds:

- mission ID
- exact 40-character source revision
- provider identity
- query SHA-256
- SHA-256 identities for source reference, document and chunk
- rank
- generation-observed flag
- generated-response SHA-256 when present
- citation count
- observation timestamp
- canonical receipt SHA-256

Raw query text, raw source identifiers and raw generated response are not persisted in the receipt.

Receipt integrity explicitly proves only receipt integrity; it does not make the underlying factual claim true and cannot independently produce a Judge `VERIFIED` verdict.

Production server currently exposes only:

```text
GET /api/evidence/grounding/status
```

There is intentionally no live Grounding POST route.

---

# 5. Dormant real Google Agent Search adapter — CLOSED repo-side

File:

```text
server/evidence/googleAgentSearchProvider.ts
```

Verified source before billing-canary work:

```text
9af1e0df5435c22e1a70afdd1d0a0b5c61e945df
```

The adapter implements the real Google Discovery Engine / Agent Search v1 request contract but is **not wired into `server.ts`**.

Safety contract:

- OAuth/IAM token only; no API-key `searchLite` path
- strict ServingConfig resource identity
- exact project binding
- global or documented regional Discovery Engine endpoint
- one `POST .../v1/{servingConfig}:search`
- `searchResultMode = CHUNKS`
- `pageSize = 5`, hard maximum 5
- no page token
- no automatic pagination
- no summary generation
- no adjacent chunk expansion
- raw chunk body is not projected into durable evidence identity
- provider failures sanitize to `agent_search_request_failed`
- disabled/incomplete config returns the existing unconfigured provider

Run #239 previously proved the adapter with **36 test files / 189 tests** before the billing-canary controller was added.

---

# 6. One-request billing canary — CLOSED repo-side

Files:

```text
server/evidence/groundingBillingCanaryController.ts
tests/grounding-billing-canary.test.ts
```

Exact arming phrase:

```text
I_APPROVE_ONE_AGENT_SEARCH_BILLING_CANARY
```

State machine:

```text
DISABLED
INELIGIBLE_SOURCE
READY
RUNNING
NOT_CONFIGURED
OBSERVED
SPENT_FAILED
BLOCKED
```

Hard cost contract:

```text
maxProviderRequests = 1
providerRequestsUsed = 0 | 1
```

Run #241 proves:

- disabled by default => 0 provider requests
- malformed/non-exact source revision => 0 provider requests
- provider `NOT_CONFIGURED` => 0 retrieval requests
- successful billing canary => exactly 1 retrieval request
- successful receipt is memoized; repeat trigger cannot spend another request
- 25 concurrent triggers deduplicate to exactly 1 provider request
- provider failure marks `SPENT_FAILED`; no automatic retry is allowed
- failure text is sanitized
- mission/source mismatch blocks before spending request budget
- production `server.ts` does not import or expose the billing-canary controller

Therefore current live billable Agent Search usage from ProofFleet remains:

```text
0 requests
```

No promotional-credit consumption is claimed.

---

# 7. Grounding UI — CLOSED repo-side

Component:

```text
src/components/GroundingEvidencePanel.tsx
```

`App.tsx` polls the read-only status endpoint.

UI states:

```text
GROUNDING_OBSERVED
GROUNDING_READY
GROUNDING_FAILED
NOT_CONFIGURED
```

Critical user-facing truth:

> Google Agent Search retrieval evidence. A grounding observation is evidence input, not a Judge verdict.

The UI currently exposes no control that can incur Agent Search usage.

---

# 8. GenAI App Builder promotional credit

User-observed billing promotion:

```text
Trial credit for GenAI App Builder
EUR 835.80
100% unused when discovered
valid through 2027-02-23
```

Do not assume this credit covers Cloud Run, Firestore, Artifact Registry or arbitrary Gemini usage.

Safe intended path:

```text
provision tiny own-data Agent Search store
-> arm exactly one retrieval billing canary
-> execute exactly one request
-> read Billing Cost Table / credit application
-> only then classify the SKU as promo-eligible
-> only then scale usage
```

Until that billing readback exists, promo eligibility is `UNKNOWN`.

---

# 9. Real Google Cloud truth / blocker

Known provider facts:

- project ID: `project-b29d4703-a302-4b05-b2e`
- project number: `511695074775`
- Cloud Run service: `prooffleet`
- region: `europe-west1`
- earlier AI Studio revision: `prooffleet-00001-6rc`
- earlier live revision lacked `PROOFFLEET_SOURCE_REVISION`
- existing runtime identity: `511695074775-compute@developer.gserviceaccount.com`
- Firestore `(default)` database does not exist
- no Firestore location has been selected

Candidate deploy workflow reached real Google WIF authentication and Google returned:

```text
invalid_target
```

Expected resource:

```text
projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo
```

Current provider truth:

```text
WIF_PROVIDER = NOT_PROVISIONED / NOT_REACHABLE
CANDIDATE_IMAGE_PUSH = NOT_EXECUTED
CLOUD_RUN_CANDIDATE_REVISION = NOT_CREATED_BY_THIS LANE
TRAFFIC_MUTATION = NOT_EXECUTED
FIRESTORE_WRITE = NOT_EXECUTED
```

Do not restart manual Cloud Shell / WIF setup unless explicitly requested.

---

# 10. What remains before real Grounding usage

The repo-side implementation is now prepared as far as it can safely go without provider provisioning.

A real Agent Search billing canary still requires provider-side facts that do not yet exist:

1. an actual own-data Agent Search datastore with chunking enabled;
2. its exact ServingConfig resource identity;
3. a runtime OAuth/IAM identity permitted to call Search;
4. explicit server wiring of the dormant adapter;
5. explicit arming of the one-request billing-canary controller;
6. one real Search request;
7. Billing Cost Table / promotion-credit readback.

No live provider usage should be simulated to bridge this gap.

---

# 11. Mandatory engineering loop

1. re-read exact PR head;
2. choose one causal gap;
3. make one coherent change set;
4. add regression for the property;
5. push/write branch;
6. re-read exact source head and unchanged `main` base;
7. read Actions for exactly that head;
8. if red, read only the first causal failure;
9. fix only that family;
10. do not call provider/liveness green from unit evidence;
11. update this handoff at meaningful boundaries.

Never manufacture a success fallback.

---

# 12. Merge / submission rule

Keep PR #1 Draft and `main` unchanged until at minimum:

- exact source head has green CI and Docker runtime smoke;
- a real networked ADK/Gemini canary is observed on an exact source-bound runtime;
- a Cloud Run candidate is deployed from exact source SHA and read back with matching immutable digest;
- at least one real provider effect is proven by authoritative readback;
- final demo mission reaches `VERIFIED` only through required real evidence;
- no production truth path uses mocks/fakes;
- Devpost claims match final observed services/model/runtime.
