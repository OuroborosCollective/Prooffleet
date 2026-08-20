# ProofFleet Engineering Handoff — 2026-08-20

Status: **clean checkpoint / new-chat handoff recommended**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Current verified source head: `6d7f88eff49b84792dc8d38b5e6e666b25ecc271`  
Synthetic merge SHA tested by GitHub: `6412faee540e0493e5ff99c760b83651a670e222`  
GitHub Actions run: `32330118293` / run number `111`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**  
Devpost project: `https://devpost.com/software/prooffleet`

---

# 1. Exact verified checkpoint

GitHub Actions run #111 completed successfully for source head:

```text
6d7f88eff49b84792dc8d38b5e6e666b25ecc271
```

Remote evidence from the same run:

- immutable install through `npm ci`
- TypeScript `tsc --noEmit` passed
- **24 test files passed**
- **99 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- built production server HTTP smoke passed on injected `PORT=3187`
- authenticated production consent HTTP E2E passed
- high/critical dependency audit passed
- package-lock bootstrap skipped because the committed lock already exists
- source-head and GitHub synthetic merge identities are kept distinct

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "6d7f88eff49b84792dc8d38b5e6e666b25ecc271",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "6412faee540e0493e5ff99c760b83651a670e222",
  "testedMergeSha": "6412faee540e0493e5ff99c760b83651a670e222"
}
```

Do not call any later commit current-green until its own PR head and Actions log have been read back.

---

# 2. CRITICAL OPEN CORRECTION — Gemini model identity

This is the **first task in the new chat before any other feature work**.

During this session the runtime originally used:

```text
gemini-3.7-flash
```

It was changed to:

```text
gemini-3.6-flash
```

because the assistant incorrectly concluded that 3.7 was unsupported.

After that change, a fresh connected Gmail read found an official Google AI Studio message dated **2026-08-14** with subject:

```text
Introducing Gemini 3.7 Flash in the Gemini API
```

The assistant then rechecked current Google information and concluded the earlier downgrade was wrong.

Therefore:

> **Do not treat the current 3.6 model restriction as final product truth merely because CI is green.**

The new chat must first independently re-check current official Google documentation for the exact supported model ID and hackathon eligibility, then — if confirmed — restore `gemini-3.7-flash` consistently across runtime, manifest, tests, truth guards, README and architecture source.

Current files that intentionally need review/correction:

```text
server/gemini.ts
server/contracts.ts
server/fleetRunner.ts
tests/gemini-model-truth.test.ts
scripts/verify-ci.mjs
README.md
docs/architecture.mmd
```

Important: preserve the **good architectural hardening** created during the mistaken model change:

- only Orchestrator and Scout advertise/use Gemini;
- the other six roles remain `deterministic-runtime` unless real code later changes that;
- Orchestrator cannot issue final truth verdicts;
- Scout Gemini context without a grounding tool remains `grounded=false` with no invented citations;
- Gemini output is `AGENT_OUTPUT`, not authoritative runtime evidence;
- model/provider/output hash provenance remains attached;
- configured model/provider failures must propagate honestly instead of being disguised as deterministic fallback.

The problem is the exact model ID / unsupported-3.7 guard, not these authority boundaries.

---

# 3. Project goal

ProofFleet is an **evidence-first multi-agent control loop** for autonomous engineering/enterprise-agent actions.

Core promise:

> An agent saying an action succeeded is not proof that the action happened.

Target demo path:

```text
mission
-> agent planning/work
-> explicit operation-bound human consent
-> bounded external effect
-> authoritative provider readback
-> evidence + receipts
-> independent verifier
-> non-mutating Judge
-> VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED
```

The judged story should emphasize the unlikely hero: a solo developer / small team getting enterprise-grade agent safety without a full SRE/security/platform organization.

Fortified Enterprise Fleet alignment must be real, not decorative: Google agent framework/SDK, Gemini, Google Cloud runtime/infrastructure and defensible security/identity/observability surfaces.

---

# 4. Current core architecture

Eight roles are implemented and separated:

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

Authority boundaries:

- **Orchestrator** — planning/decomposition only; no external mutation, no final verdict.
- **Scout** — context/grounding boundary; no fake citations.
- **Builder** — deterministic artifact/spec preparation; cannot certify external truth.
- **Analyst** — deterministic analysis; no invented truth/confidence scores.
- **Sentinel** — security/permission checks; cannot grant consent.
- **Auditor** — evidence integrity inspection; cannot replace Judge.
- **Gatekeeper** — derives concrete `OperationSpec` and requests exact-operation human consent; never auto-approves.
- **Operator** — executes only authorized effects through the effect executor; cannot judge itself.
- **Independent Verifier** — read-only snapshots.
- **Judge** — non-mutating final verdict authority.

Memory/context is advisory and cannot satisfy runtime proof.

---

# 5. Closed hardening boundaries

## Consent / identity

- no auto-consent
- pending remains pending until explicit human action
- consent bound to exact `OperationSpec`
- engine distinguishes decision authenticity from execution authorization
- REJECTED can be authentic while remaining unusable for execution
- signed short-lived HttpOnly operator session
- identity derived server-side
- client cannot assert operator identity
- forged request IDs / operator identities regression-tested
- authenticated production consent HTTP E2E green
- consent modal accessibility/focus policy regression-tested

## Idempotency / ambiguous writes

- same-operation in-flight deduplication
- 50 concurrent same-operation calls -> exactly one apply
- readback-before-retry mandatory
- unavailable readback never authorizes blind write
- conflicting operation identity never overwritten
- transient consent/provider failure does not poison durable idempotency cache
- only readback-observed durable success is cached final

## Evidence / Judge

- hash chain proves integrity, not external truth
- Memory cannot satisfy runtime proof
- runtime mocks/fakes cannot satisfy production evidence
- rejected consent cannot become VERIFIED through integrity alone
- mission verdict is scoped to exact mission evidence/receipts
- prior missions cannot contaminate later verdicts
- verdict vocabulary is only:

```text
VERIFIED
BLOCKED_BY_MISSING_EVIDENCE
CONTRADICTED
```

## Reproducibility / runtime

- committed `package-lock.json`
- `npm ci` canonical install
- `npm run verify:ci` canonical local/CI chain
- Cloud Run `PORT` contract fixed and smoke-tested on injected port
- source-head vs tested synthetic merge receipt explicit
- README contains clone/install/test/run instructions

---

# 6. Google Cloud live-proof lane

Prepared but **NOT executed live yet**.

Workflow:

```text
.github/workflows/gcp-live-proof.yml
```

Safety properties already regression-tested:

- manual `workflow_dispatch` only
- never push/PR automatic mutation
- GitHub OIDC / Workload Identity Federation
- no long-lived service-account JSON key
- `id-token: write`
- explicit manual Firestore confirmation phrase:

```text
I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE
```

- exact workflow source SHA is bound into the operation identity
- Cloud Run must expose matching `PROOFFLEET_SOURCE_REVISION` before Firestore proof write is authorized
- generated auth artifacts and proof receipts excluded from Git/Docker context

Required real repository variables are still unresolved in this session:

```text
PROOFFLEET_GCP_PROJECT_ID
PROOFFLEET_GCP_REGION
PROOFFLEET_GCP_WIF_PROVIDER
PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT
PROOFFLEET_CLOUDRUN_SERVICE
PROOFFLEET_FIRESTORE_COLLECTION
```

Do not guess them and do not replace WIF with a long-lived JSON service-account key.

Required live proof:

1. exact source deployed/identified on Cloud Run;
2. Cloud Run provider readback;
3. declared source SHA equals candidate source SHA;
4. explicit owner-approved Firestore proof write;
5. authoritative Firestore readback of exact operation identity;
6. Actions artifact `gcp-live-proof-receipt.json` inspected;
7. provider observation projected into application Evidence/Receipt;
8. independent Judge only then allowed to produce VERIFIED for the live demo claim.

---

# 7. Devpost state

Project exists:

```text
https://devpost.com/software/prooffleet
```

Repository is registered:

```text
https://github.com/OuroborosCollective/Prooffleet
```

**Do not final-submit yet.**

Architecture work:

```text
docs/architecture.mmd
```

A PNG/PDF architecture rendering was generated and visually inspected in the prior chat, but the Devpost connector did not expose upload support for the submission architecture-file field. The source currently reflects the temporary 3.6 model state and must be updated after the Gemini correction before final rendering/upload.

Still required before final submission:

- corrected final architecture PNG/PDF uploaded to Devpost
- real Google Cloud deployment/readback proof
- exact Google Cloud services selected based on what was truly used
- real Gemini call exercised in the deployed demo
- approximately 4-minute public YouTube/Vimeo demo showing working app and Google Cloud backend
- final project write-up, learnings and technologies
- final required Devpost questions/track fields
- final submission only after all truth-sensitive fields match evidenced implementation

---

# 8. Mandatory working method

This is the operating procedure that worked well and must continue.

## Before every task/context/tool switch

1. make **one coherent causal change set**;
2. push/write it to `hardening/fortified-fleet`;
3. read the exact PR head from GitHub;
4. confirm `main` did not unexpectedly move;
5. read the GitHub Actions run for that exact source head;
6. inspect the actual job/log, not merely a green badge;
7. preserve source-head vs synthetic-merge identity explicitly;
8. update the handoff at meaningful P0 boundaries.

## When CI/runtime is red

1. fetch the exact failing job/log;
2. identify the **first causal error family**;
3. patch only that family;
4. add a regression that would have failed before the patch;
5. push;
6. run/read the same remote lane again;
7. do not begin unrelated work until the lane is understood.

## Evidence rules

- planning != execution
- execution != proof
- memory != truth
- hash integrity != external truth
- logs/traces != automatically business truth
- green UI != verified outcome
- agent success text != authoritative readback
- no runtime mock/fake can satisfy a production proof requirement
- missing required provider observation => `BLOCKED_BY_MISSING_EVIDENCE`

Never manufacture a success fallback.

---

# 9. Exact next-work order for the fresh chat

## P0-1 — correct Gemini model truth

1. read this handoff;
2. read current PR head and Run #111;
3. independently check current official Google Gemini docs;
4. resolve whether `gemini-3.7-flash` is the correct supported model for the hackathon;
5. if confirmed, revert the mistaken 3.6-only restriction across runtime/manifest/tests/guard/README/architecture source while preserving authority/provenance hardening;
6. add/update regression(s) around the official supported model contract;
7. push;
8. read exact new head + CI + logs;
9. do not continue until green and understood.

## P0-2 — finalize architecture artifact

After model correction:

1. update `docs/architecture.mmd`;
2. render final PNG/PDF;
3. visually inspect labels/arrows/truth boundaries;
4. ensure live GCP is shown as pending unless actually observed;
5. upload to Devpost architecture field manually if connector still lacks file-upload support.

## P0-3 — resolve real GCP identity/WIF

Resolve actual:

- Google Cloud project ID
- region
- WIF provider resource
- WIF service account
- Cloud Run service
- Firestore database/collection

Set only verified values.

## P0-4 — live provider proof

Execute the manual live-proof workflow only after real identities and minimal IAM are checked. Require Cloud Run + Firestore authoritative readback and inspect the resulting receipt artifact.

## P0-5 — real end-to-end demo mission

Run a mission that visibly proves:

```text
Gemini-backed reasoning
-> deterministic role delegation
-> explicit human consent
-> external Firestore effect
-> authoritative readback
-> evidence receipt chain
-> independent verification
-> Judge VERIFIED
```

Also demonstrate a negative case where a claimed success without matching authoritative evidence becomes BLOCKED or CONTRADICTED.

## P1 — Fortified managed surfaces

Only after the causal core is stable, add/prove the managed features that materially improve judging:

- Pub/Sub
- Google ADK / Agent Runtime if actually integrated
- Agent Registry
- Memory Bank
- Agent Identity / Gateway
- Model Armor
- OpenTelemetry / Agent Observability

No managed-service claim without provision + readback.

## Final Devpost

Then produce/upload:

- final architecture file
- final public demo video
- exact technologies/services/model
- learnings
- reproducible testing answer = Yes only if README/current source still support it
- category = Fortified Enterprise Fleet
- final submit only after all mandatory fields are evidence-aligned.

---

# 10. Merge rule

Keep PR #1 Draft until at minimum:

- current branch head has green immutable-lock CI;
- corrected Gemini model contract is independently verified and green;
- consent production E2E remains green;
- source/tested merge identities remain unambiguous;
- at least one real Google Cloud mutating effect is proven by authoritative readback;
- final live demo mission can reach VERIFIED only through real readback;
- no production truth path uses mocks/fakes;
- Devpost artifact claims match the final evidenced implementation.

Do not merge `main` merely because the local/unit architecture is strong.
