# Memory.md — ProofFleet

> Project-local, append-only integration memory for `OuroborosCollective/Prooffleet`.
> Historical bootstrap created 2026-09-09 from retrievable repository/conversation evidence.

## Operating contract

1. Read this file before every N+1 integration work session.
2. Append one concise entry after each completed work block and before merge.
3. Record task, decisions, touched surfaces, tests/evidence, learned result, open points and next safe step.
4. Append-only; corrections are new entries.
5. Provider/cloud truth is only real when independently observed and bound to source revision, artifact/image digest and target readback.
6. No mock/stub/fake cloud state may assert Cloud Run, Firestore, ADK/Gemini, WIF or promotion truth.
7. Consent must remain operation/revision/target-bound; replay/stale grants fail closed.
8. Promotion is a distinct effect and must consume verified candidate/provider evidence rather than infer readiness from CI.
9. Secrets never belong in this file.

## Entry format

```text
### YYYY-MM-DD — short title
Status: VERIFIED | PARTIAL | BLOCKED | HISTORICAL
Task:
Decisions:
Touched surfaces:
Evidence:
Learned:
Open:
Next safe step:
```

---

### 2026-08-20 to 2026-08-24 — Evidence-first fortified fleet
Status: VERIFIED repository merge; external provider boundaries only where observed
Task: Harden ProofFleet for the Google All Things Agentic Hackathon around eight-agent separation, consent, idempotency and real evidence.
Decisions:
- Eight concrete agent roles with bounded permissions.
- Independent non-mutating Judge/verifier.
- HttpOnly operator sessions and operation-bound human consent.
- Readback-before-retry and single-active-mission ownership.
- Revision/manifest-bound SHA-256 receipts and strict memory/evidence separation.
- GCP adapters report `NOT_PROVISIONED` rather than simulate cloud truth.
- WIF-only candidate deployment with zero normal traffic and exact OCI/runtime-manifest identity.
Touched surfaces: Agent runtime, consent, Judge, HTTP E2E, Docker/Cloud Run candidate flow, jury/submission evidence.
Evidence:
- PR #1 merged after 244 commits.
- Live-proven application source `f432b111a621a4a57afe229b0f50fbb129aaa164`.
- ProofFleet CI Run #273: 42 test files / 220 tests, production build, authenticated HTTP E2E, exact Docker smoke and revision receipt.
- GCP Candidate Deploy run `32516371741` observed Cloud Run candidate `prooffleet-00008-lux` in `europe-west1`, tag `pf-f432b111a621`, 0% normal traffic.
- OCI index digest `sha256:0ad47bce1a90bb62c927c0b89f085c4d83171bfb96f626f708f126a69bc30d6d`; registry-proven linux/amd64 runtime digest `sha256:e5d22049a6994087552004064c7a1acf96e440618b5562fdb346282f8b88dc81`; Cloud Run readback matched the exact runtime digest.
- ADK canary status remained `NOT_RUN`; no live Gemini claim.
Learned: Candidate deployment, provider readiness, HTTP health, ADK execution and traffic promotion are separate truth boundaries.
Open: Live ADK/Gemini observation, bounded Firestore proof, and any traffic promotion require their own receipts.
Next safe step: Never upgrade an external capability to green until the exact provider observation exists.

### 2026-08-24 — Immutable GitHub Action pinning
Status: VERIFIED repository merge
Task: Close the privileged CI supply-chain gap by pinning external GitHub Actions to reviewed full commit SHAs.
Decisions: Keep former major versions as comments for readability; add fail-closed regression coverage; remove one-shot maintenance workflow after deterministic rewrite.
Touched surfaces: Privileged CI/GCP workflows.
Evidence: PR #3 merged; head `1f25466583245d3ef03dffd4811df3fea1549ba1`.
Learned: Mutable action tags undermine revision-bound evidence even if application source is pinned.
Open: No Cloud Run/Firestore/traffic behavior change was part of this block.
Next safe step: Treat any new third-party CI action as supply-chain code requiring immutable review/pin.

### 2026-08-24 — Architecture Assurance truth-surface lane
Status: VERIFIED repository merge; deliberate NO-GREEN on unobserved external systems
Task: Close architecture coverage gaps across truth/Judge/UI, eight-agent separation, consent/Firestore, receipt integrity and CI/runtime binding.
Decisions:
- Only canonical final-mission verdict may project public green.
- Blocked/contradicted/stale/incomplete evidence cannot be upgraded by UI.
- Non-Operator roles cannot emit authoritative provider-readback/operation evidence.
- Executor enforces issued grants and semantic idempotency across retries/runs.
- Exported/cross-mission/cross-revision receipt tampering is rejected.
- CI/runtime chain binds exact source/merge/run/attempt/runner/container/image/health bytes to GitHub artifact ID + digest.
- External candidate/ADK/promotion workflows verify WIF principal/project/federation and secret-free credential-config hash.
Touched surfaces: Architecture assurance tests, provider/consent/receipt boundaries and CI artifact binding.
Evidence:
- PR #4 merged; head `ea5da386e523beb0451b36bb82de64450ef8d17b`.
- ProofFleet CI run #470 (`32742630724`) passed TypeScript, regressions, production build, HTTP runtime, real Docker health, dependency audit and artifact binding.
- Runtime artifact `9525801818` SHA-256 `9a2eb252802429a06433703a308e7cbe5c86fc1056e9d8b07f0d8be904c153ee`.
- Binding artifact `9525802682` SHA-256 `8c167a09324f43722e9cef008769abf1b1472c63d37410519268d5dbd624e152`.
Learned: Architecture assurance is valuable precisely when it refuses to convert static or CI evidence into unobserved cloud/provider truth.
Open: No external GCP/WIF/ADK/Gemini/Firestore/promotion observation is claimed by this lane without its own provider receipt. Promotion still needs explicit artifact-causality consumption of verified candidate + ADK evidence.
Next safe step: Keep provider and promotion lanes independently source/digest/readback-bound.

---

## Backfill boundary

This bootstrap captures retrievable ProofFleet integration history. It is not a transcript. Append older recovered blocks as `Historical recovery` entries instead of rewriting existing records.
