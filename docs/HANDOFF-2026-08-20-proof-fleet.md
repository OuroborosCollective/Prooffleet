# ProofFleet Engineering Handoff — 2026-08-20

Status: **active checkpoint / continue current engineering loop**

Repository: `OuroborosCollective/Prooffleet`  
Branch: `hardening/fortified-fleet`  
PR: `#1 Hardening: evidence-first fortified fleet` — **Draft**  
Base `main`: `89302dfbe1ef732ff3962b47ce914a7e299f5075`  
Current verified source head: `1cbe81eebabd1878e7197a2e9e83c868936398d0`  
Synthetic merge SHA tested by GitHub: `5c292002061e50d998a3fc9754e5231d4ef37705`  
GitHub Actions run: `32412592933` / run number `159`

Hackathon: **Google All Things Agentic Hackathon**  
Target track: **Fortified Enterprise Fleet**  
Submission deadline: **2026-09-01 02:00 Europe/Berlin**

---

# 1. Exact current verified checkpoint

GitHub Actions run #159 completed successfully for source head:

```text
1cbe81eebabd1878e7197a2e9e83c868936398d0
```

Remote evidence from the same run:

- immutable install through `npm ci`
- TypeScript `tsc --noEmit` passed
- **27 test files passed**
- **123 tests passed**
- production truth guards passed
- Vite + esbuild production build passed
- production server HTTP smoke passed on injected port
- authenticated production consent HTTP E2E passed
- exact Docker image built from `Dockerfile`
- exact Docker image started with Cloud Run `PORT=8080`
- `/api/health` read successfully from that container
- high/critical dependency audit passed
- source-head and GitHub synthetic merge identities remain distinct

Exact CI revision receipt:

```json
{
  "schemaVersion": "prooffleet.ci-revision-receipt.v1",
  "eventName": "pull_request",
  "sourceHeadSha": "1cbe81eebabd1878e7197a2e9e83c868936398d0",
  "baseSha": "89302dfbe1ef732ff3962b47ce914a7e299f5075",
  "testedCheckoutSha": "5c292002061e50d998a3fc9754e5231d4ef37705",
  "testedMergeSha": "5c292002061e50d998a3fc9754e5231d4ef37705"
}
```

Do not call a later commit current-green until its own PR head and Actions log have been read back.

---

# 2. Current product truth

ProofFleet is an evidence-first multi-agent control loop for autonomous engineering / enterprise-agent actions.

Core promise:

> An agent saying an action succeeded is not proof that the action happened.

Target causal chain:

```text
mission
-> Gemini-backed planning/context
-> deterministic role delegation
-> explicit operation-bound human consent
-> bounded external effect
-> authoritative provider readback
-> evidence + receipts
-> independent verifier
-> non-mutating Judge
-> VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED
```

Eight separated roles remain implemented:

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

Only roles that really call Gemini advertise Gemini. Memory/context remains advisory and cannot satisfy runtime proof.

---

# 3. Closed hardening boundaries

## Consent / identity

- no auto-consent
- pending remains pending until explicit human action
- consent bound to exact `OperationSpec`
- signed short-lived HttpOnly operator session
- client cannot assert operator identity
- server derives operator identity
- forged decision/request/operator identities regression-tested
- authenticated production consent HTTP E2E green
- consent modal accessibility/focus policy regression-tested

## Idempotency / ambiguous writes

- same-operation in-flight deduplication
- 50 concurrent same-operation calls -> exactly one apply
- readback-before-retry mandatory
- unavailable readback never authorizes blind write
- conflicting operation identity never overwritten
- transient consent/provider failure does not poison final idempotency cache
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

---

# 4. Google Cloud provider truth already observed

Real Cloud Run provider state has been read manually in Cloud Shell / Console.

Observed facts:

- the `prooffleet` Cloud Run service exists
- its region is `europe-west1`
- an existing runtime service account is attached
- the current AI Studio-created revision is **not** source-bound to the hardened GitHub branch because `PROOFFLEET_SOURCE_REVISION` is absent
- therefore the existing live service is **not** treated as proof for the current PR head
- Firestore API was enabled during provider investigation
- the Firestore `(default)` database does **not** exist
- no Firestore database location has been selected or created by this hardening lane

Do not hardcode private project identifiers, numeric project numbers, account credentials, API keys or service-account secrets in source or docs.

---

# 5. Revisionsgleich Cloud Run candidate path

Prepared and CI-proven, but **not deployed live yet**.

Relevant files:

```text
Dockerfile
.dockerignore
.github/workflows/gcp-deploy-candidate.yml
tests/gcp-deploy-candidate.test.ts
```

Candidate-deploy contract:

- build immutable Docker image from exact source revision
- push SHA-tagged image to Artifact Registry
- require returned `sha256:` image digest
- deploy a new Cloud Run revision with **zero traffic**
- merge only `PROOFFLEET_SOURCE_REVISION=<exact source head>` into existing environment
- preserve existing environment variable names
- preserve existing runtime service account
- provider readback must match exact source SHA + image digest
- candidate revision must still receive 0% traffic after deploy
- deployment creates an observation receipt
- traffic promotion is intentionally absent from this workflow

Pre-merge trigger contract:

- ordinary pushes and PR synchronize events never deploy
- pre-merge deploy may start only from an explicit PR `labeled` event
- required label: `proofleet-deploy-candidate`
- actor must be the repository owner
- PR must originate from the same repository
- deploy identity is `pull_request.head.sha`, never GitHub's synthetic merge SHA
- post-merge `workflow_dispatch` remains available once the workflow exists on the default branch

Do not apply the deploy label until provisioning is complete and an explicit live-deploy decision is made.

---

# 6. GCP deploy bootstrap

Prepared and regression-tested:

```text
scripts/bootstrap-gcp-deploy.sh
tests/gcp-deploy-bootstrap.test.ts
```

Purpose:

- discover canonical project identity through provider readback
- read the existing Cloud Run runtime service account authoritatively
- keep runtime identity and deployment identity separate
- prepare a dedicated `prooffleet-deploy` service account
- prepare GitHub OIDC / Workload Identity Federation restricted to exactly `OuroborosCollective/Prooffleet`
- prepare one Artifact Registry Docker repository
- grant only resource-scoped deployment rights

Intended minimal roles:

```text
roles/iam.workloadIdentityUser
roles/artifactregistry.writer
roles/run.developer
roles/iam.serviceAccountUser
```

Explicitly forbidden in this bootstrap:

```text
roles/owner
roles/editor
roles/run.admin
roles/artifactregistry.admin
roles/iam.serviceAccountAdmin
```

The bootstrap does **not**:

- create service-account JSON keys
- create Firestore resources
- choose Firestore location
- deploy Cloud Run
- change Cloud Run traffic

The run #159 regression executes the bootstrap with a fake `gcloud` provider and proves that default mode performs only provider readbacks while printing all mutations as dry-run plans.

---

# 7. Exact next action

## P0 — real Cloud Shell deploy-bootstrap dry-run

Run `scripts/bootstrap-gcp-deploy.sh` in the real Google Cloud environment **without `--apply`**.

Required real inputs are already known from provider readback but must be supplied at execution time instead of hardcoded in repository source:

```text
--project-id <verified-project-id>
--region europe-west1
--cloud-run-service prooffleet
```

Expected outcome:

- canonical project ID/number read back
- existing Cloud Run runtime identity read back
- dedicated deploy service-account identity derived
- WIF pool/provider existing state or planned creation shown
- Artifact Registry existing state or planned creation shown
- only `[dry-run]` mutation lines
- final six repository variables printed
- no IAM / registry / Cloud Run / traffic / Firestore mutation performed

After the user returns the dry-run output:

1. inspect every provider identity and planned mutation;
2. reject any unexpected broad role or identity collapse;
3. only then consider a separate explicit `--apply` run;
4. after apply, perform authoritative readback before setting GitHub repository variables;
5. only after provisioning is proven may the candidate-deploy label be created/applied.

Firestore remains outside this step.

---

# 8. Still-open hackathon P0s

Even after candidate Cloud Run deployment, the project is not submission-ready until the following are real and evidenced:

1. actual Google ADK / qualifying Google agent framework use in the orchestration path;
2. live 8-agent end-to-end canary;
3. one explicitly consented external effect with authoritative provider readback;
4. Firestore location/database created only after an explicit location decision;
5. live negative demos:
   - claimed success without provider evidence -> BLOCKED;
   - provider contradiction -> CONTRADICTED;
   - ambiguous write -> no duplicate apply;
6. synchronized final evidence report generated from exact submission commit;
7. final architecture artifact and public demo video;
8. final Devpost fields matching the actually observed services/model/runtime.

No managed-service or runtime claim without provider readback.

---

# 9. Mandatory engineering loop

This operating method is part of the project discipline and must continue:

1. pick one highest-value causal/runtime gap;
2. read exact current PR head;
3. make one coherent change set;
4. add a regression that enforces the property;
5. push/write the branch;
6. re-read exact PR head and `main` base;
7. read GitHub Actions for that exact source head;
8. if red, read the exact first failing job/log;
9. fix only the first causal error family;
10. repeat until remote CI is green and understood;
11. run runtime/provider readbacks separately from unit evidence;
12. update this handoff at meaningful P0 boundaries.

Evidence rules:

```text
planning != execution
execution != proof
memory != truth
hash integrity != external truth
agent success text != authoritative readback
unit evidence != live provider evidence
```

Missing required provider observation means:

```text
BLOCKED_BY_MISSING_EVIDENCE
```

Never manufacture a success fallback.

---

# 10. Merge rule

Keep PR #1 Draft and keep `main` unchanged until at minimum:

- exact current source head has green CI and Docker runtime smoke;
- candidate Cloud Run revision is deployed from an exact source SHA and read back with matching image digest;
- at least one real provider effect is proven by authoritative readback;
- final live demo mission can reach VERIFIED only through real readback;
- no production truth path uses mocks/fakes;
- mandatory Google agent-framework requirement is satisfied by real code;
- Devpost claims match the final evidenced implementation.

Do not merge `main` merely because local/unit architecture is strong.
