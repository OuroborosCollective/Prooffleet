# ProofFleet Engineering Handoff — 2026-08-20

Status: **active checkpoint / continue current engineering loop**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Current verified source head before this handoff-only commit: `4b889bf859fd46ba606809cc0723424f14af2773`  
Synthetic merge SHA tested by GitHub: `5b38c0c95adc65f77bfd3767089a1b3d9c6ce490`  
GitHub Actions run: `32420016509` / run number `187`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

This file update advances the branch head. Re-read PR #1 and CI before changing code; do not call the handoff-only head green until its own CI is observed.

---

# 1. Exact current verified checkpoint

Run #187 is fully green for source head:

```text
4b889bf859fd46ba606809cc0723424f14af2773
```

Remote evidence from the same run:

- immutable dependency install through `npm ci`
- TypeScript `tsc --noEmit` passed
- **28 test files passed**
- **142 tests passed**
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
  "sourceHeadSha": "4b889bf859fd46ba606809cc0723424f14af2773",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "5b38c0c95adc65f77bfd3767089a1b3d9c6ce490",
  "testedMergeSha": "5b38c0c95adc65f77bfd3767089a1b3d9c6ce490"
}
```

Dependency-audit truth on this exact graph:

- `npm audit --audit-level=high` exits successfully
- **0 high / 0 critical** findings
- remaining upstream findings are **19 moderate + 6 low**
- the high/critical ADK transitives were fixed by explicit npm overrides rather than weakening the gate:

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

Evidence rules:

```text
planning != execution
execution != proof
memory != truth
hash integrity != external truth
agent success text != authoritative readback
unit evidence != live provider evidence
```

---

# 3. Google ADK P0 — repo-side CLOSED

Google ADK is now part of the real reasoning path rather than a decorative dependency.

Current runtime contract:

- dependency: `@google/adk ^1.6.0`
- model: `gemini-3.7-flash`
- provider provenance: `google-adk`
- `FleetRunner` keeps its narrow `LlmProvider` boundary
- the compatibility provider in `server/gemini.ts` executes a real ADK `LlmAgent + Runner + InMemorySessionService`
- each invocation creates an isolated ADK session
- user content is sent with explicit `role: "user"`
- only `isFinalResponse(event)` output is accepted
- missing final response fails with `google_adk_no_final_response`
- no direct `new GoogleGenAI(...)` execution path remains

Authority boundary:

- ADK agent receives **no tools**
- ADK cannot execute external effects
- ADK cannot grant or infer consent
- ADK cannot mutate the Evidence Ledger
- ADK cannot act as Independent Verifier or Judge
- Orchestrator and Scout output remains `AGENT_OUTPUT`, not authoritative provider truth
- Scout remains explicitly ungrounded until a real source tool exists

Key compatibility:

- accepts `GOOGLE_API_KEY` or legacy AI-Studio `GEMINI_API_KEY`
- both present but different => fail closed: `gemini_api_key_conflict`
- legacy-only key may be exposed process-locally to ADK as `GOOGLE_API_KEY`
- key value is never logged or placed into receipts

What is **not yet proven**:

- no live networked ADK/Gemini response has been observed in this engineering session yet
- CI proves ADK package, construction, contracts and runtime packaging, not a paid/network provider call

---

# 4. Closed consent / idempotency / truth boundaries

## Consent and operator identity

- no auto-consent
- pending remains pending until explicit human decision
- consent bound to exact `OperationSpec`
- signed short-lived HttpOnly operator session
- server controls operator identity; client cannot assert it
- forged request/decision/operator identity regressions
- authenticated production consent HTTP E2E green
- consent dialog accessibility and least-destructive focus policy tested

## Idempotency and ambiguous writes

- same-operation in-flight deduplication
- 50 concurrent same-operation calls -> exactly one apply
- readback-before-retry mandatory
- unavailable readback never authorizes a blind write
- conflicting operation identity never overwritten
- transient consent/provider failures do not poison final cache
- only readback-observed durable success is cached as final

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

# 5. Cloud Run candidate and promotion lanes — repo-side CLOSED, live execution pending

Candidate workflow:

```text
.github/workflows/gcp-deploy-candidate.yml
```

Safety contract:

- exact PR source SHA, never synthetic merge SHA
- WIF only; no service-account JSON key
- immutable Artifact Registry image digest
- new Cloud Run candidate with **0% normal traffic**
- source-SHA-derived candidate tag
- preserves existing runtime service account and upstream env names
- provider must report Ready + matching source SHA + matching digest
- exact tagged candidate URL must pass `/api/health`
- only then emit promotable candidate receipt

Promotion workflow:

```text
.github/workflows/gcp-promote-candidate.yml
```

Safety contract:

- explicit owner trigger only
- revalidates zero-traffic candidate, source SHA, digest, runtime identity and Ready state
- re-smokes exact candidate URL before traffic mutation
- promotes one exact revision; never floating `LATEST`
- requires authoritative 100% post-readback + service health
- captures prior traffic and attempts rollback if post-promotion verification fails
- promotion lane does not build images, create revisions or touch Firestore

Do **not** apply candidate or promotion labels without an explicit live-mutation decision.

---

# 6. Real Google Cloud truth already observed

Provider observations already established:

- a real `prooffleet` Cloud Run service exists in `europe-west1`
- it was originally deployed by Google AI Studio
- the observed original revision did **not** expose `PROOFFLEET_SOURCE_REVISION`
- therefore that original service is not evidence for the hardened GitHub source head
- an existing Google default Compute Engine service account is attached as runtime identity
- Firestore `(default)` database does **not** exist
- no Firestore location has been selected by this hardening lane

Deploy bootstrap:

```text
scripts/bootstrap-gcp-deploy.sh
tests/gcp-deploy-bootstrap.test.ts
```

A real dry-run was completed successfully and explicitly reported that no IAM, registry, Cloud Run, traffic or Firestore mutation occurred.

The deploy bootstrap is designed for a dedicated deployment identity, GitHub OIDC/WIF and least-privilege roles. It must not create long-lived service-account keys.

User-facing Cloud Shell is no longer part of the normal operating path. Prefer GitHub automation and small Google Cloud Console UI actions when provider configuration is unavoidable.

---

# 7. Exact next P0

## P0 — live Google ADK / Gemini canary without cloud mutation

Goal: prove that the exact source revision can make a **real networked** Google ADK -> Gemini `gemini-3.7-flash` call while preserving the same truth boundary.

Build a manual-only GitHub Actions canary that:

1. checks out an explicitly supplied exact source SHA;
2. uses a GitHub Actions secret for the Gemini key; never logs the key;
3. invokes the existing production ADK provider path, not a separate sample implementation;
4. uses a deterministic bounded prompt requiring no external/world claim;
5. records only safe metadata:
   - source SHA
   - framework `google-adk`
   - model ID
   - output SHA-256
   - non-empty final-response observation
   - timestamp
6. never persists raw API credentials;
7. does not call Gatekeeper/Operator or any external-effect adapter;
8. emits an `ADK_RUNTIME_OBSERVED` artifact only after a real final response;
9. fails closed if the secret is absent, model differs, final response is empty, or source SHA mismatches.

This is evidence of a real ADK/Gemini runtime call. It is **not** evidence of Cloud Run deployment or external-effect success.

After the workflow is repo-side tested, the only user action should be a small GitHub UI secret/config step if the repository does not already expose an appropriate Gemini secret.

---

# 8. Still-open hackathon P0s after the ADK live canary

1. provision/verify the GitHub WIF deployment identity and Artifact Registry without long-lived keys;
2. run one zero-traffic Cloud Run candidate deploy from exact source SHA;
3. authoritative provider readback of revision + image digest + source SHA + tagged HTTP health;
4. explicit promotion only after candidate proof;
5. live 8-agent end-to-end canary;
6. one explicitly consented external effect with authoritative provider readback;
7. explicit Firestore location decision before database creation;
8. negative live demos:
   - claimed success without provider evidence -> BLOCKED_BY_MISSING_EVIDENCE
   - provider contradiction -> CONTRADICTED
   - ambiguous write -> no duplicate apply
9. synchronized final evidence report generated from exact submission commit;
10. final Devpost content/demo matching only observed facts.

---

# 9. Mandatory engineering loop

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

# 10. Merge / submission rule

Keep PR #1 Draft and keep `main` unchanged until at minimum:

- exact source head has green CI and Docker runtime smoke;
- live ADK/Gemini call is observed;
- candidate Cloud Run revision is deployed from an exact source SHA and read back with matching immutable digest;
- at least one real provider effect is proven by authoritative readback;
- final demo mission can reach VERIFIED only through required real evidence;
- no production truth path uses mocks/fakes;
- Devpost claims match final observed services/model/runtime.

Do not submit Devpost or merge `main` merely because the repo-side architecture is strong.
