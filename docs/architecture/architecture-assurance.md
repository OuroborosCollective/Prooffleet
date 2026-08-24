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
| Eight agent roles | `tests/agent-capability-isolation.test.ts` probes all eight runtime contexts; only Gatekeeper sees `requestConsent`. A Builder cannot seed Operator memory, and ledger envelopes preserve the actual producer role. | Runs in the Node regression lane. | Core runtime contract; no external target. |
| Consent | `tests/consent*.test.ts`, reset tests, and `tests/operation-readback-failclosed.test.ts` reject replay/forgery, stale/reset authority, different operations, missing consent, and failed readback. | `scripts/verify-consent-http-e2e.mjs` exercises authenticated HTTP rejections and reset boundaries. | Runtime-checked in CI. |
| Evidence / Judge | `tests/judge*.test.ts`, `tests/evidence.test.ts`, and `tests/verifier.test.ts` block absent proof, reject contradictory/tampered evidence, and preserve canonical ledger state under export mutation. | Node regression lane; external truth remains separately source-bound. | Core runtime contract. |
| GitHub Actions supply chain | `tests/github-actions-sha-pinning.test.ts` and `tests/ci-action-runtime.test.ts` reject tags and unknown action identities. | GitHub Actions evaluates the pinned workflow itself. | CI-scoped; action availability is still an external runtime condition. |
| CI identity | `tests/execution-identity*.test.ts`, `tests/ci-revision-receipt.test.ts`, and `tests/ci-evidence-identity.test.ts` reject wrong SHA, malformed IDs, runner drift, and artifact/readback mismatch. | CI emits a run/attempt-scoped receipt. | CI-scoped only after an actual run artifact exists. |
| Docker | `.github/workflows/ci.yml` binds build image ID plus `/api/health` byte hash into the CI receipt. | CI starts the built image and performs HTTP health readback. | CI container-runtime scoped. |
| Cloud Run candidate | Candidate workflow/tests require source SHA → OCI index → linux/amd64 child manifest → revision/tag → 0% traffic → tagged health. Mismatches fail closed. | Google Cloud readback is required for an observed candidate receipt. | External target unobserved until a matching candidate receipt exists. |
| WIF | Credential parser and workflows bind principal, project number, audience, and non-secret credential configuration hash; malformed or divergent federation is rejected. | Authenticated `gcloud` readback is required. | External target unobserved until WIF receipt exists. |
| ADK / Gemini | Canary tests require an exact source-bound challenge/response and keep provider-ready separate from `ADK_RUNTIME_OBSERVED`. Failure spends the bounded attempt. | Live provider invocation only occurs through the guarded canary. | External provider unobserved until its receipt exists. |
| Firestore | Create-only/idempotent effect tests reject source/identity conflicts and duplicate effects; readback is authoritative before retry. | Real Firestore readback is required for an observed effect. | External target unobserved until effect receipt exists. |
| Promotion | Promotion tests require exact candidate source/digest/health/ADK receipt before traffic mutation and force rollback/readback on failed promotion checks. | Cloud Run traffic/readback is authoritative. | External target unobserved until promotion receipt exists. |
| Frontend truth state | `tests/truth-verdict-presentation.test.ts` prevents a green verified presentation when evidence is blocked/contradicted or integrity/policy fails. | Production build and HTTP smoke validate bundle/server delivery; this is not a claim of a browser/provider success. | UI cannot outstate its Judge/integrity/policy inputs. |
| Failure removal | Failure tests cover CI, WIF, ADK, Firestore, Cloud Run, UI, and consent paths separately; none may synthesize success for another layer. | Each external layer retains its own receipt boundary. | Fail-closed by design; receipt required per layer. |

## Required review rule

A reviewer may mark only the relevant row **scoped green** after reading the
corresponding runtime or provider receipt bound to the same source revision and
artifact/digest. A passing static or unit test is evidence of a contract, not evidence
that a cloud provider or target is live.


