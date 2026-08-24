# ProofFleet Architecture Assurance Lane

**Baseline:** `main@e4ed518d7a44354a2f9257da428b084f7210ceec`  
**Lane:** `hardening/architecture-assurance`  
**Scope:** assurance evidence only. This document does not turn a static contract or a
fixture into a provider/runtime observation.

## Contract

```text
architecture invariant
  -> static contract
  -> negative regression
  -> runtime / HTTP / container check
  -> provider or target readback (when an external target exists)
  -> source + artifact/digest binding
  -> scoped verdict only
```

A green presentation is scoped to the weakest verified link. No external GCP, ADK,
Firestore, or Cloud Run claim is considered observed merely because the repository
contains a workflow or a unit test.

## Coverage matrix

| Surface | Invariant and negative evidence | Runtime / external boundary | Current assurance classification |
|---|---|---|---|
| Eight agent roles | `tests/agent-capability-isolation.test.ts` probes all eight runtime contexts; only Gatekeeper sees `requestConsent`, every non-Operator role is blocked from emitting authoritative operation evidence, and memory/ledger envelopes preserve the actual producer role. `tests/agent-authority-boundary.test.ts` keeps direct effect imports exclusive to Operator. | Runs in the Node regression lane. | Core runtime contract; no external target. |
| Consent | `tests/consent*.test.ts`, `tests/firestore-effect.test.ts`, reset tests, and `tests/operation-readback-failclosed.test.ts` reject replay/forgery, stale/reset authority, different operations, missing consent, issuer-less grants, and failed readback. | `scripts/verify-consent-http-e2e.mjs` exercises authenticated HTTP rejections and reset boundaries. | Runtime-checked in CI. |
| Evidence / Judge | `tests/judge*.test.ts`, `tests/evidence.test.ts`, and `tests/verifier.test.ts` block absent proof, reject contradictory/tampered evidence, and preserve canonical ledger and receipt state under export mutation. | Node regression lane; external truth remains separately source-bound. | Core runtime contract. |
| GitHub Actions supply chain | `tests/github-actions-sha-pinning.test.ts` and `tests/ci-action-runtime.test.ts` reject tags and unknown action identities. | GitHub Actions evaluates the pinned workflow itself. | CI-scoped; action availability is still an external runtime condition. |
| CI identity | `tests/execution-identity*.test.ts`, `tests/ci-revision-receipt.test.ts`, and `tests/ci-evidence-identity.test.ts` reject wrong SHA, malformed IDs, runner drift, container drift, runtime-readback mismatch, and mismatched artifact identity. | CI emits a v3 receipt plus a post-upload artifact-binding receipt. | CI-scoped only after matching run artifacts exist. |
| Docker | `tests/docker-base-image-pinning.test.ts` requires an immutable base image digest; CI binds build image ID → exact started container ID/state → raw `/api/health` bytes → v3 receipt. | CI starts the built image and performs HTTP health readback. | CI container-runtime scoped only after a matching CI artifact chain exists. |
| Cloud Run candidate | Candidate workflow/tests require source SHA → OCI index → linux/amd64 child manifest → revision/tag → 0% traffic → tagged health. Mismatches fail closed. | Google Cloud readback is required for an observed candidate receipt. | External target unobserved until a matching candidate receipt exists. |
| WIF | Credential parser and workflows bind principal, project number, audience, and non-secret credential configuration hash; malformed or divergent federation is rejected. | Authenticated `gcloud` readback is required. | External target unobserved until WIF receipt exists. |
| ADK / Gemini | Canary tests require an exact source-bound challenge/response and keep provider-ready separate from `ADK_RUNTIME_OBSERVED`. Failure spends the bounded attempt. | Live provider invocation only occurs through the guarded canary. | External provider unobserved until its receipt exists. |
| Firestore | Create-only/idempotent effect tests reject source/identity conflicts and duplicate effects; readback is authoritative before retry. | Real Firestore readback is required for an observed effect. | External target unobserved until effect receipt exists. |
| Promotion | Promotion re-reads source/digest/health/ADK state before traffic mutation. The inventory found that it does not yet consume an independently validated candidate/ADK artifact; this is a tracked hardening gap. | Cloud Run traffic/readback is authoritative. | External target unobserved; artifact-bound promotion remains pending. |
| Frontend truth state | `tests/truth-verdict-presentation.test.ts` prevents a green verified presentation when evidence is blocked/contradicted or integrity/policy fails. | Production build and HTTP smoke validate bundle/server delivery; this is not a claim of a browser/provider success. | UI cannot outstate its Judge/integrity/policy inputs. |
| Failure removal | Failure tests cover CI, WIF, ADK, Firestore, Cloud Run, UI, and consent paths separately; none may synthesize success for another layer. | Each external layer retains its own receipt boundary. | Fail-closed by design; receipt required per layer. |

## Required review rule

A reviewer may mark only the relevant row **scoped green** after reading the
corresponding runtime or provider receipt bound to the same source revision and
artifact/digest. A passing static or unit test is evidence of a contract, not evidence
that a cloud provider or target is live.



## Inventory findings and bounded closure

The initial inventory found the following evidence gaps. They are recorded separately
from passing baseline tests so a static test never becomes an external-runtime claim.

| Finding | Evidence gap | Lane disposition |
|---|---|---|
| UI health projection | An empty hash-consistent ledger and idle agents could look green. | Closed in this lane with neutral projections and negative regressions. |
| Authoritative agent evidence | A non-Operator could use the generic evidence emitter to label an authoritative operation readback. | Closed: the Runner rejects non-Operator `operation_result` or authoritative source-kind evidence before sealing. |
| Firestore semantic replay | A new GitHub run changed the effect key through `workflowRunId`, allowing another create-only document for the same source and target. | Closed in this lane: run/attempt stay only in execution evidence; semantic source/target identity determines the effect key. |
| Firestore consent issuer | The real Firestore executor could fall back to shape-only grant checks when it was created without the issuing `ConsentEngine`. | Closed: the executor requires an issuing validator; forged-but-shape-valid grants are blocked before a provider create. |
| Docker chain | CI recorded an image and health hash but not the started-container identity, immutable base digest, raw health artifact, or artifact digest. | Closed in code: v3 receipt and post-upload artifact-binding receipt; a matching CI run is still required before scoped green. |
| Receipt export mutation | Receipt snapshots were cloned but did not have a direct mutation-regression proof. | Closed with an exported-receipt mutation test; canonical receipts remain hash-valid and unchanged. |
| External receipts | Candidate, live-proof, ADK and promotion workflows did not all recompute receipt hashes before use/upload. | In progress; requires canonical receipt verification. |
| WIF symmetry | Candidate captures credential configuration evidence more strongly than ADK and promotion. | In progress; no provider claim until a matching WIF readback exists. |
| Promotion causality | Promotion did not consume the candidate/ADK artifacts it depended on. | In progress; do not treat a promotion as artifact-bound before a matching receipt chain exists. |
| ADK cluster uniqueness | The bounded canary is per process, not yet a cluster-wide durable effect. | Documented for a separate provider-backed target; no false `OBSERVED` upgrade. |

| Public Judge API | A public ad-hoc `Judge.judge(...)` call could omit server-owned proof requirements and outstate a blocked final mission. | Closed: only the already mission-scoped canonical final verdict is readable; no generic HTTP re-judging. | Covered by production HTTP negative regression. |
