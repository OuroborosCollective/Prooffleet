# ProofFleet Jury Brief

This page is the shortest evidence-first path through ProofFleet for the **Google All Things Agentic Hackathon / Fortified Enterprise Fleet** judging rubric.

Official scoring emphasis:

- **Innovation & Operational Utility — 40%**
- **Architectural Discipline & Tech Stack — 30%**
- **Demo & Production Readiness — 30%**

ProofFleet is optimized around one thesis: **autonomous operational utility becomes enterprise-usable only when success is causally tied to authoritative evidence.**

## 1. The one-sentence pitch

ProofFleet is an eight-role autonomous fleet where planning, execution, human consent, provider readback, evidence, independent verification, and final judgment are separate authorities — so a model cannot mark its own homework.

## 2. Evidence you can verify immediately

### Exact live-proven application source

```text
f432b111a621a4a57afe229b0f50fbb129aaa164
```

### Software chain

ProofFleet CI Run #273:

```text
42 test files
220 tests
TypeScript contract check
production truth guards
production build
authenticated HTTP E2E
exact Docker runtime smoke
source/tested-merge revision receipt
high/critical dependency audit
```

CI identity:

```text
source:       f432b111a621a4a57afe229b0f50fbb129aaa164
base:         89302dfbe1ef732ff3962b47ce914a7e299f5075
tested merge: a0d12bfa40f10382d8f7c3ee9a6c4ce378c9c523
```

### Live Cloud Run chain

Candidate Deploy Run #12 (`32516371741`) completed successfully.

```text
project:        project-b29d4703-a302-4b05-b2e
region:         europe-west1
service:        prooffleet
revision:       prooffleet-00008-lux
candidate tag:  pf-f432b111a621
normal traffic: 0%
```

Supply-chain identity:

```text
source SHA
  ↓
OCI index sha256:0ad47bce1a90bb62c927c0b89f085c4d83171bfb96f626f708f126a69bc30d6d
  ↓ exact registry-proven linux/amd64 child
runtime manifest sha256:e5d22049a6994087552004064c7a1acf96e440618b5562fdb346282f8b88dc81
  ↓ independent provider readback
Cloud Run revision prooffleet-00008-lux
```

The receipt additionally requires the existing runtime service account and inherited environment-variable names to remain unchanged, provider `Ready=true`, candidate normal traffic to remain zero, and the exact tagged candidate to pass `/api/health`.

Receipt:

```text
schema:   prooffleet.gcp-deploy-candidate.v2
artifact: GitHub Actions artifact 9458987801
```

## 3. Truth matrix

| Claim | Current state | What proves it | What would upgrade it |
|---|---|---|---|
| Source code contracts | **CI-PROVEN** | CI #273, 220 tests | newer exact CI receipt |
| Candidate deploy | **LIVE OBSERVED** | WIF deploy + direct response + revision describe | production promotion if deliberately approved |
| Source → container identity | **LIVE OBSERVED** | source label/env + OCI index + registry child + Cloud Run readback | none needed for this candidate |
| Tagged candidate health | **LIVE OBSERVED** | exact tag `/api/health` | repeat only for a newer app SHA |
| Candidate normal traffic | **0%** | service traffic readback | explicit promotion, not inferred |
| ADK canary eligibility | **OBSERVED** | read-only runtime canary endpoint | authenticated POST canary |
| Live ADK/Gemini call | **`NOT_RUN`** | canary status | `ADK_RUNTIME_OBSERVED` receipt |
| Firestore effect | **PREPARED / NOT OBSERVED** | bounded manual live-proof workflow | `OBSERVED` Firestore receipt |
| Agent Search grounding | **`NOT_CONFIGURED`** | read-only grounding status | intentionally not required for submission |
| Production promotion | **NOT PERFORMED** | promotion job skipped | explicit promotion gate + post-readback |

A judge should treat the exact states above as the product's truth boundary. `NOT_RUN`, `NOT_CONFIGURED`, and `PREPARED` are intentional states, not hidden failures.

## 4. Innovation & Operational Utility — 40%

ProofFleet's utility is not another planner that emits convincing text. The system is designed around **bounded autonomous action with independently verifiable consequences**.

Concrete operational properties:

- eight concrete roles divide planning, analysis, security, consent, effect execution, integrity checking, and judgment;
- one active mission owns the runtime at a time;
- concurrent mission starts fail with a stable conflict rather than overlapping truth surfaces;
- cost-bearing or destructive actions require explicit intent and authenticated operator authority;
- consent is bound to one exact `OperationSpec` and cannot be reused for a different operation;
- writes use readback-before-retry and idempotency;
- 50 parallel calls with the same operation ID must produce exactly one apply;
- an external effect cannot become verified merely because the executor returned success;
- a missing provider readback blocks the claim instead of triggering a blind retry.

The operating model is therefore: **autonomy first, but authority and evidence are narrower than autonomy.**

## 5. Architectural Discipline & Tech Stack — 30%

### Authority separation

```text
Actor != Verifier != Judge
```

- Orchestrator/Scout may use Google ADK + Gemini 3.7 Flash for reasoning.
- Operator may execute an authorized effect.
- Independent Verifier receives read-only snapshots.
- Judge is non-mutating and owns final verdict semantics.
- Gemini output, memory, and static candidates cannot satisfy runtime-required provider proof.

### State separation

- **Memory Store:** advisory context only; structurally non-sealable as evidence.
- **Evidence Ledger / Receipt Chain:** durable integrity identities.
- **Provider readback:** external-world evidence source.
- **Judge:** consumes evidence; cannot create it.

### Supply-chain discipline

ProofFleet does not conflate a multi-platform/attested OCI index with the manifest Cloud Run actually executes. The candidate lane proves the immutable index bytes, resolves exactly one supported `linux/amd64` child manifest, and then requires Cloud Run to report that exact child.

### Credentials and provider boundaries

- candidate deployment uses GitHub OIDC / Workload Identity Federation;
- no long-lived service-account JSON credential is accepted by that lane;
- full Cloud Run deployment JSON is retained only in runner temp rather than printed;
- GCP adapters fail closed as `NOT_PROVISIONED` / failed readback when real resources or IAM are absent.

## 6. Fortified Enterprise Fleet capability mapping

These mappings distinguish **application-layer equivalents** from managed Google services so the architecture does not claim provisioning that has not been observed.

| Fortified-fleet capability | ProofFleet implementation | Evidence state |
|---|---|---|
| Agent registry / role discovery | eight concrete role modules under `server/agents/`, assembled through runtime contracts | **CODE + CI PROVEN**; not claiming a managed Google Agent Registry deployment |
| Agent runtime | Express runtime + `FleetRunner`, single-active-mission ownership, production container | **CODE + CI PROVEN**; Cloud Run container **LIVE OBSERVED** |
| Memory Bank-like state | dedicated Memory Store separated from evidence | **CODE + CI PROVEN**; not claiming managed Memory Bank provisioning |
| Agent identity / gateway-like policy | authenticated operator session, explicit intent, `OperationSpec`, operation-bound consent, Gatekeeper/Operator split | **CODE + HTTP E2E PROVEN** |
| Model Armor | real GCP adapter/runbook with fail-closed `NOT_PROVISIONED` semantics | **PREPARED**, not claimed live |
| Agent observability | OpenTelemetry adapter/runbook with real endpoint/export checks when configured | **PREPARED**, not claimed live |
| Cloud provider readback | Cloud Run adapter + candidate deploy/readback receipts | **LIVE OBSERVED** for exact candidate source |
| Durable external effect | Firestore operation executor + bounded live-proof workflow | **CODE + CI PROVEN**, live effect not yet observed |

## 7. Demo & Production Readiness — 30%

The demo should show two separate things rather than blending them:

1. **Product authority flow:** mission → consent → effect/readback → evidence → verifier → Judge.
2. **Provider evidence:** exact source SHA and live Cloud Run candidate receipt.

This avoids a common demo failure mode where a polished UI is implicitly used as proof of cloud state.

Use [`DEMO.md`](DEMO.md) for the unedited recording plan.

Production-readiness evidence already present:

- immutable lockfile + `npm ci`;
- exact source/merge CI receipts;
- production build and started-server HTTP smoke;
- exact Docker image smoke on managed-runtime port semantics;
- authenticated production HTTP E2E;
- WIF-only deploy identity;
- zero-traffic candidate deployment before any promotion;
- runtime service-account preservation;
- environment-name preservation;
- independent revision readback;
- artifact-retained live receipt;
- high/critical dependency gate.

## 8. What ProofFleet deliberately does not claim

At the current evidence boundary:

- no live ADK/Gemini model call has been observed by the canary (`NOT_RUN`);
- no Firestore live effect has an `OBSERVED` receipt yet;
- no Agent Search grounding request has been made or is needed;
- no production traffic promotion is claimed;
- no merge to `main` is implied by the Draft candidate.

Those non-claims are part of the architecture: **truth is monotonic only when stronger evidence arrives.**

## 9. Judge checklist

A skeptical reviewer should be able to answer yes to all of these:

- [ ] Can I identify the exact application SHA that the live evidence refers to?
- [ ] Can I reproduce the source-level verification chain?
- [ ] Can I distinguish the PR source SHA from the synthetic merge SHA tested by CI?
- [ ] Can I distinguish the OCI index digest from the runtime child manifest digest?
- [ ] Can I see an independent Cloud Run revision readback?
- [ ] Can I verify the candidate received 0% normal traffic?
- [ ] Can I see that the tagged candidate passed HTTP health?
- [ ] Can I tell which claims remain `NOT_RUN`, `NOT_CONFIGURED`, or merely prepared?
- [ ] Can I see that an actor cannot self-verify or self-judge?
- [ ] Can I see that missing readback blocks writes/claims rather than being guessed around?

If the answer is yes, the central ProofFleet claim is demonstrated: **autonomous action can be useful without asking the operator to trust an agent's narration of its own success.**
