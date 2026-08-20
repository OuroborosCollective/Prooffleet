# ProofFleet Hardening Handoff — 2026-08-20

Status: **checkpoint / stop-before-next-feature**

Repository: `OuroborosCollective/Prooffleet`
Branch: `hardening/fortified-fleet`
PR: `#1 Hardening: evidence-first fortified fleet`
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`
Last code head verified before this documentation-only handoff commit: `f983ce98705959838bd67737fcd81515f1a1ab26`
GitHub synthetic merge SHA tested for that head: `e2ccf1d8772bf1724c010d59ba3e32abafd1df14`
GitHub Actions run: `32323794717` / run number `33`

## Verified checkpoint before this handoff

The code head `f983ce98705959838bd67737fcd81515f1a1ab26` was independently read back from PR metadata and its PR CI run completed successfully.

Remote CI evidence:

- immutable dependency install via `npm ci`
- TypeScript `tsc --noEmit` passed
- 17 test files passed
- 71 tests passed
- production truth guards passed
- Vite + esbuild production build passed
- real started production-server HTTP smoke passed
- high/critical dependency audit passed
- package-lock bootstrap correctly skipped because the lock already exists

Important revision nuance: GitHub PR Actions checks out and tests the synthetic merge commit. Therefore the successful runtime receipt above proves merge-compatibility of branch head `f983ce...` with base `89302df...` through merge SHA `e2ccf1d...`; it must not be described as if `GITHUB_SHA` were the branch head itself.

This handoff file is a documentation-only commit after that verified checkpoint. The new branch head created by this file must receive its own CI readback before any later engineering work is called green.

## What is now integrated on the hardening branch

### Truth / evidence

- no hardcoded truth or consensus scores in the production truth path
- internal hash chains are treated as integrity evidence, not external-world truth
- independent verifier works on snapshots
- Judge is non-mutating and fail-closed
- final verdict vocabulary is restricted to:
  - `VERIFIED`
  - `BLOCKED_BY_MISSING_EVIDENCE`
  - `CONTRADICTED`
- runtime-required claims require explicitly allowed authoritative source kinds
- proof requirements can bind `operationId`, source revision and deployment revision
- an operator-rejected mission can no longer become `VERIFIED` merely because its internal evidence chain is hash-valid

### Consent / operator identity

- auto-consent is removed
- pending consent stays pending until explicit human action
- grant is bound to the exact `OperationSpec`
- server derives operator identity from a short-lived signed HttpOnly session
- client-supplied operator identity is not trusted
- missing operator authentication fails closed
- consent endpoint requires explicit intent header
- consent modal uses alert-dialog semantics, deterministic focus containment and least-destructive initial focus
- Escape only maps to explicit rejection when an authenticated operator can actually make that decision; otherwise the dialog remains open

### Idempotency / failure recovery

- concurrent calls with the same `operationId` are deduplicated in-flight
- 50 parallel calls -> one apply regression exists
- ambiguous or failed writes perform authoritative readback before retry
- readback failure does not authorize a blind write
- conflicting existing identity fails closed instead of overwriting
- transient failures and consent blockers do not poison the durable idempotency cache
- only observed durable success is cached as final

### Google Cloud proof surfaces prepared in code

- structured Cloud Run readback projection includes real provider fields when available and leaves unknown fields null
- Firestore operation effect uses exact operation identity and authoritative readback
- Firestore effect binds mission, operation, parameters hash and exact source revision
- real Firestore execution is unavailable unless `PROOFFLEET_SOURCE_REVISION` is an exact lowercase 40-character Git SHA
- source revision participates in the operation parameters/hash/identity and therefore in consent binding
- GCP adapters stay honest as `NOT_PROVISIONED` when no real cloud configuration is present

No live Google Cloud success is claimed by this checkpoint.

## Working method to continue with

This is the engineering method that produced the current checkpoint and should remain the default.

### 1. Secure first

Before switching tasks, context, agent or tool:

1. push/write the current coherent change set to the feature branch;
2. read back the exact PR/branch head from GitHub;
3. verify that `main` has not moved unexpectedly or been modified by the work;
4. run/read the remote CI for that exact candidate;
5. record the distinction between branch head and GitHub synthetic merge SHA.

Never continue merely because a write call returned success.

### 2. Evidence before labels

Do not accept:

- `green` because a report says green;
- `failed` because a wrapper says failed;
- `verified` because hashes match;
- `deployed` because an internal state field says deployed.

Trace every important result back to the producing source and read it back from the authoritative boundary.

### 3. One causal error family at a time

When CI/runtime turns red:

1. pull the exact failing job/log;
2. identify the first causal family;
3. patch only that family;
4. add a regression that would have failed before the patch;
5. push;
6. rerun the same remote lane;
7. do not start another unrelated fix until the lane is understood.

Examples already found with this method:

- TypeScript union-narrowing family
- Firestore identity serialization family
- readback-failure allowing blind apply
- conflict overwrite risk
- consent-blocked result poisoning idempotency cache
- rejected consent still allowing integrity-only `VERIFIED`
- focus-trap inference failure after accessibility hardening

### 4. Runtime and unit truth stay separate

Unit doubles are allowed only inside tests.

A unit test may prove the contract of a Firestore/Cloud Run adapter, but it does not prove that the actual Google Cloud service is provisioned or reachable.

A successful production HTTP smoke proves that the built server starts and the checked endpoints behave on the CI runner. It does not prove the external GCP effect.

### 5. Every fix gets a regression

No bug fix should be accepted only as a source edit.

The regression should encode the causal property, for example:

- no blind write if readback is unavailable
- no overwrite on operation identity conflict
- later valid consent can recover the same operation id
- later provider recovery can reuse the same operation id
- source revision change changes operation identity
- human rejection cannot become `VERIFIED`
- consent dialog focus cannot escape the modal policy

### 6. Fail closed on missing evidence

If ProofFleet cannot prove an effect from an allowed authoritative source, the result must remain:

`BLOCKED_BY_MISSING_EVIDENCE`

Do not manufacture a success fallback.

### 7. Context check before resuming

After a pause or handoff, do not immediately continue from memory.

Read back, in order:

1. PR metadata / current head
2. latest workflow run and jobs
3. this handoff
4. current implementations of the files touched by the next task
5. relevant tests
6. current open evidence gaps

Then decide the next smallest causal change.

## Next work — ordered, not yet claimed complete

### P0 — authenticated consent HTTP E2E

Build a real production-server HTTP regression covering:

1. mission produces pending consent;
2. unauthenticated consent response is rejected;
3. operator login creates HttpOnly session;
4. same session can explicitly approve/reject;
5. server-side operator identity is used;
6. no client operator identity can override it;
7. without a real Firestore executor, approval must still not create a false successful external-effect verdict.

### P0 — CI revision receipt clarity

Make CI explicitly print/store both:

- `source_head_sha` = pull-request branch head
- `tested_merge_sha` = GitHub synthetic merge commit

Do not collapse these into one `tested_sha` label.

### P0 — live Google Cloud proof path

Provision and then verify, in order:

1. exact Cloud Run service/deployment identity;
2. exact source revision injection;
3. Firestore collection + ADC/IAM;
4. one real operation-bound Firestore write;
5. authoritative Firestore readback;
6. Receipt/evidence projection from that readback;
7. Judge `VERIFIED` only when the real readback satisfies the operation-bound requirement.

### P1 — Pub/Sub event ingress

Wire the incident/event path to a real Pub/Sub message and bind message/correlation identity to mission evidence.

### P1 — remaining Google track services

Only after the core real proof path is stable, evaluate/provision ADK/agent runtime, registry, memory, identity/gateway, Model Armor and observability surfaces that materially improve the judged demonstration.

Do not add a managed-service claim without actual provision + readback.

## Merge rule

Keep PR #1 draft until at minimum:

- current branch head CI is green with immutable lock
- authenticated consent HTTP E2E is green
- branch-head and merge-SHA receipts are unambiguous
- at least one real Google Cloud mutating effect is proven by authoritative readback
- no production truth path uses mocks/fakes
- final demo path can show claim -> operation -> consent -> effect -> readback -> evidence -> Judge causally

`main` must not be merged merely because the local/unit architecture is strong.

## Resume instruction

On resume, first say what exact revision is being resumed and what CI/runtime evidence is current. Then take exactly one next P0 item, implement it, regression-test it, push it, and read back the remote result before proceeding.
