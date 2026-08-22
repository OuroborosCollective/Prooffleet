# ProofFleet — New Chat Starter

Use this entire document as the first message/context for the next engineering chat.

---

You are taking over **ProofFleet** as the primary implementation + truth owner for the Google **All Things Agentic Hackathon**, target track **Fortified Enterprise Fleet**.

Repository:

```text
OuroborosCollective/Prooffleet
```

Working branch:

```text
hardening/fortified-fleet
```

Draft PR:

```text
#1 Hardening: evidence-first fortified fleet
```

Do **not** merge `main` automatically.

Base `main` at handoff time:

```text
89302dfbe1ef732ff3962b47ce914a7e299f5075
```

Last fully verified source checkpoint before this handoff document was written:

```text
6d7f88eff49b84792dc8d38b5e6e666b25ecc271
```

Its GitHub synthetic merge candidate:

```text
6412faee540e0493e5ff99c760b83651a670e222
```

GitHub Actions run:

```text
run id: 32330118293
run number: 111
```

That run proved:

```text
npm ci
TypeScript green
24 test files / 99 tests green
truth guards green
production build green
production HTTP smoke on PORT=3187 green
authenticated consent production HTTP E2E green
high/critical dependency audit green
source-head vs synthetic-merge revision receipt green
```

Read first:

```text
docs/HANDOFF-2026-08-20-proof-fleet.md
README.md
docs/architecture.mmd
```

Then read current PR metadata and the latest workflow run before changing anything, because the handoff documents themselves create newer commits.

---

## The engineering method is mandatory

Work **one causal error family at a time**.

For every meaningful change:

```text
read exact current source
-> make one coherent patch
-> add regression that would fail before the patch
-> push/write to hardening/fortified-fleet
-> read exact PR head
-> confirm main did not unexpectedly move
-> read GitHub Actions for that exact source head
-> inspect actual job/log
-> distinguish source head from GitHub synthetic merge SHA
-> only then continue
```

If CI/runtime is red:

```text
exact failing job/log
-> first causal error family
-> minimal fix
-> regression
-> push
-> same remote lane again
```

Do not start unrelated work while the current lane is unexplained.

Evidence policy:

```text
planning != execution
execution != evidence
memory != truth
hash integrity != external truth
logs/traces != automatically business truth
green UI != verified outcome
agent success text != authoritative provider readback
```

A missing required provider observation must remain:

```text
BLOCKED_BY_MISSING_EVIDENCE
```

Never manufacture a fallback success.

No runtime mock/fake/test double may satisfy production evidence.

---

## Product goal

ProofFleet is an evidence-first multi-agent control loop.

Core message:

> ProofFleet does not ask users to trust autonomous agents. It gives them evidence to verify what actually happened.

The demo must visibly trace:

```text
mission
-> agent work
-> explicit operation-bound human consent
-> bounded external effect
-> authoritative readback
-> evidence + receipts
-> independent verifier
-> non-mutating Judge
-> VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED
```

The primary/unlikely-hero user is a solo developer, indie maintainer or small technical team that needs enterprise-grade autonomous-agent safety without a full SRE/security/platform organization.

---

## Current architecture truth

Core roles:

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

Separation of authority:

- Orchestrator plans; no external mutation, no final verdict.
- Scout handles context/grounding boundary; no fake citations.
- Builder prepares deterministic artifacts/work; cannot certify external truth.
- Analyst performs deterministic analysis; no fake confidence scores.
- Sentinel checks security/permissions; cannot grant consent.
- Auditor checks integrity snapshots; cannot replace Judge.
- Gatekeeper derives the exact OperationSpec and requests explicit human consent; no auto-approve.
- Operator executes only authorized effects and projects authoritative readback provenance; cannot judge itself.
- Independent Verifier reads snapshots only.
- Judge is non-mutating final truth authority.

Memory is context only and cannot satisfy runtime proof.

---

## FIRST P0 — correct the Gemini model mistake before anything else

The previous chat made an important mistake:

- runtime originally used `gemini-3.7-flash`;
- the assistant incorrectly concluded 3.7 was unsupported;
- runtime/manifest/tests/guard/README/architecture were changed to `gemini-3.6-flash`;
- later a connected official Google AI Studio email dated 2026-08-14 was found with subject `Introducing Gemini 3.7 Flash in the Gemini API`;
- the assistant then rechecked and concluded the downgrade was wrong.

Therefore your **first engineering action** is:

1. independently verify current official Google documentation for the exact supported model ID and hackathon requirement;
2. do not trust the old 3.6 guard merely because CI is green;
3. if official Google docs confirm `gemini-3.7-flash`, restore it consistently in:

```text
server/gemini.ts
server/contracts.ts
server/fleetRunner.ts
tests/gemini-model-truth.test.ts
scripts/verify-ci.mjs
README.md
docs/architecture.mmd
```

4. preserve the useful authority/provenance hardening:

```text
only Orchestrator + Scout use/advertise Gemini
other six roles stay deterministic-runtime unless real code changes
Gemini output = AGENT_OUTPUT, not runtime truth
provider/model/output SHA provenance retained
Scout remains grounded=false without a real grounding tool
no invented citations
configured Gemini failure propagates honestly
Judge remains final verdict authority
```

5. regression-test;
6. push;
7. read exact new head + CI + job log before doing anything else.

---

## Then P0 — architecture artifact

Canonical source already exists:

```text
docs/architecture.mmd
```

After the Gemini correction:

- update the diagram source;
- render final PNG/PDF;
- visually inspect it;
- show React/TypeScript UI, Express runtime, eight core roles, explicit consent, Operator -> OperationExecutor -> Firestore, Cloud Run readback, evidence/receipts, independent verifier and Judge;
- show live GCP as pending unless actual provider observation exists;
- upload the final file to Devpost architecture field manually if the connector still lacks generic submission-file upload.

---

## Then P0 — resolve live Google Cloud identity/WIF

The live-proof workflow exists but has not been executed successfully against real GCP yet:

```text
.github/workflows/gcp-live-proof.yml
```

It is manual-only and uses GitHub OIDC / Workload Identity Federation; do not replace it with a long-lived service-account JSON key.

Resolve real values only:

```text
PROOFFLEET_GCP_PROJECT_ID
PROOFFLEET_GCP_REGION
PROOFFLEET_GCP_WIF_PROVIDER
PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT
PROOFFLEET_CLOUDRUN_SERVICE
PROOFFLEET_FIRESTORE_COLLECTION
```

The Cloud Run service must expose:

```text
PROOFFLEET_SOURCE_REVISION
```

matching the exact workflow source SHA before a Firestore proof mutation may be authorized.

The mutating live workflow requires exact manual confirmation:

```text
I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE
```

The live proof must produce and inspect:

```text
gcp-live-proof-receipt.json
```

No live-GCP success claim without real Cloud Run + Firestore readback.

---

## Then P0 — real end-to-end demonstration

Build/run one positive and one negative demo.

Positive path:

```text
Gemini-backed reasoning
-> role separation
-> explicit human consent
-> real Firestore operation
-> authoritative Firestore readback
-> Cloud Run source/deployment identity readback
-> evidence receipts
-> independent verifier
-> Judge VERIFIED
```

Negative path:

```text
agent claims success
-> authoritative readback missing or contradicts claim
-> Judge BLOCKED_BY_MISSING_EVIDENCE or CONTRADICTED
```

This negative truth test is strategically important for judging.

---

## P1 after the causal core is stable

Only add managed Fortified Enterprise Fleet surfaces when they materially improve the judged demo and can be provisioned/read back:

```text
Pub/Sub
Google ADK / Agent Runtime
Agent Registry
Memory Bank
Agent Identity / Gateway
Model Armor
OpenTelemetry / Agent Observability
```

Do not claim any managed service just because adapter code exists.

---

## Devpost state

Project:

```text
https://devpost.com/software/prooffleet
```

Repo link already registered:

```text
https://github.com/OuroborosCollective/Prooffleet
```

Submission is **not final submitted**.

Target category:

```text
Fortified Enterprise Fleet
```

Before final submit still need:

```text
corrected final architecture file uploaded
real GCP deployment/readback evidence
exact Google Cloud services based on real use
real Gemini model/use based on final deployed system
~4 minute public YouTube/Vimeo demo
final write-up + learnings
all mandatory Devpost fields
```

Final submit only when every truth-sensitive field matches the evidenced implementation.

---

## Merge rule

Keep PR #1 Draft until:

```text
current head green with npm ci
correct Gemini model contract independently verified and green
consent production E2E still green
source/tested merge identities explicit
at least one real Google Cloud mutating effect proven by authoritative readback
live mission reaches VERIFIED only through real provider evidence
no production truth path uses mocks/fakes
Devpost artifacts match final implementation
```

Do not merge `main` just because local/unit tests are strong.

---

## Start the new chat by doing this, not by summarizing

1. Read `docs/HANDOFF-2026-08-20-proof-fleet.md` from GitHub.
2. Read PR #1 current head/base/draft state.
3. Read latest Actions run/jobs/log for that exact head.
4. Re-check official Google docs for Gemini 3.7 Flash.
5. Fix only the Gemini model-truth family first.
6. Add/update regression.
7. Push.
8. Read exact remote CI evidence.
9. Continue only when that lane is understood.
