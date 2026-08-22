# ProofFleet Unedited Demo Plan

This is the recommended recording plan for the Devpost demo video. The target is a **single continuous take** that demonstrates the product authority flow and the live Google Cloud evidence without using one as a substitute for the other.

## Demo principle

The recording should make one idea memorable:

> **The agent does not get to mark its own work as true.**

Do not hide blocked states. If a provider is not configured or an ADK canary remains `NOT_RUN`, show that honestly. A visible fail-closed boundary is a ProofFleet feature.

## Target length: about 3 minutes

### 0:00–0:20 — Hook

Show the ProofFleet UI or README title and say, in substance:

> “Most agent demos end when the model says ‘done.’ ProofFleet starts there. Planning, execution, consent, provider readback, evidence, independent verification, and judgment are separate authorities.”

Immediately name the final Judge states:

```text
VERIFIED
BLOCKED_BY_MISSING_EVIDENCE
CONTRADICTED
```

### 0:20–0:55 — Eight-role fleet and authority boundaries

Show the architecture diagram.

Point out:

- Orchestrator and Scout use Google ADK / Gemini reasoning.
- Builder, Analyst, Sentinel, Auditor, Gatekeeper, and Operator are deterministic-runtime roles.
- Actor, Verifier, and Judge are different authorities.
- Memory is context only and cannot satisfy runtime proof.

Keep this fast. The memorable visual is the split between **agent work** and **truth authority**.

### 0:55–1:35 — Consent and bounded autonomous action

Run the authority flow in the product UI on a configured local production server or another environment where operator authentication is deliberately available.

Show:

1. mission start requires explicit mission intent + authenticated operator session;
2. the mission reaches an operation-bound consent boundary;
3. the consent request identifies one exact operation;
4. rejecting does not execute the effect;
5. approving authorizes only that exact operation;
6. the Operator cannot self-judge.

If the current public Cloud Run candidate does not have operator authentication provisioned, **do not fake this part in the cloud**. Use the real local production HTTP path and say that the next section is the independent cloud-provider proof for the exact source revision.

Useful local production setup:

```bash
npm ci
npm run build
NODE_ENV=production PORT=3000 \
  PROOFFLEET_OPERATOR_TOKEN=<demo-token> \
  PROOFFLEET_SESSION_SECRET=<demo-session-secret> \
  PROOFFLEET_OPERATOR_IDENTITY=<demo-operator> \
  npm start
```

Do not display the actual secret/token values in the recording.

### 1:35–2:15 — Evidence, verifier, and Judge

Show the evidence/receipt UI or the corresponding runtime output.

Explain the causal chain:

```text
OperationSpec
  → explicit consent
  → readback-before-write/retry
  → external effect/readback
  → durable evidence receipt
  → Independent Verifier
  → non-mutating Judge
```

Call out one negative case if it is easy to demonstrate:

- missing readback → `BLOCKED_BY_MISSING_EVIDENCE`, or
- contradictory identity → `CONTRADICTED`.

This is stronger than showing only a happy-path `VERIFIED` badge because it demonstrates that the truth boundary is real.

### 2:15–2:50 — Live Google Cloud proof

Switch to PR #1 / GitHub Actions Candidate Deploy Run #12 or the retained receipt artifact.

Show these exact identities:

```text
application source:
f432b111a621a4a57afe229b0f50fbb129aaa164

Cloud Run revision:
prooffleet-00008-lux

candidate tag:
pf-f432b111a621

normal traffic:
0%
```

Then show the supply-chain proof:

```text
OCI index:
sha256:0ad47bce1a90bb62c927c0b89f085c4d83171bfb96f626f708f126a69bc30d6d

linux/amd64 runtime manifest:
sha256:e5d22049a6994087552004064c7a1acf96e440618b5562fdb346282f8b88dc81
```

Explain in one sentence:

> “Buildx produced an immutable OCI index; ProofFleet independently hashed the registry bytes, resolved the exact linux/amd64 child manifest, and required Cloud Run to report that exact child before the candidate could pass.”

Show that the exact tagged candidate passed `/api/health`.

### 2:50–3:05 — Honest boundary + close

Show the ADK canary status:

```text
eligible: true
status: NOT_RUN
```

Say:

> “That is not painted green. Cloud Run deployment and HTTP health are observed; the live ADK model canary is still NOT_RUN, and Firestore is not claimed observed until its own provider receipt exists. ProofFleet's product is that distinction.”

Close with:

> “Autonomous agents are useful. ProofFleet makes their claims auditable.”

## Recording checklist

Before recording:

- [ ] exact app source is still `f432b111a621a4a57afe229b0f50fbb129aaa164` for the live Cloud Run receipt being shown;
- [ ] PR #1 still contains the Run #12 evidence section;
- [ ] local `npm run verify:ci` or CI #273 is green;
- [ ] no secret/token value is visible in terminal history, environment panels, browser devtools, or Actions logs;
- [ ] candidate receipt artifact `9458987801` is available;
- [ ] architecture diagram is open and readable;
- [ ] demo operator credentials, if used locally, are disposable and not shown;
- [ ] browser tabs are pre-arranged to avoid dead air;
- [ ] no Agent Search billing canary is enabled for the demo.

## Suggested browser/tab order

1. ProofFleet UI
2. architecture diagram
3. PR #1 live evidence section
4. CI #273 summary
5. Candidate Deploy Run #12 summary / receipt
6. Devpost project page

## What not to do

Do not:

- call a model-generated statement authoritative provider evidence;
- present local mocks/test doubles as live cloud proof;
- imply `ADK NOT_RUN` means an ADK model call was observed;
- imply the bounded Firestore lane has run if no `OBSERVED` receipt exists;
- promote the zero-traffic candidate merely for a prettier demo;
- enable paid Agent Search grounding merely to collect a badge;
- show raw Cloud Run service/deploy JSON that can include inherited environment values;
- edit out a failed state and then describe the video as unedited.

## Backup demo path

If a live UI interaction fails during recording, use the deterministic evidence path rather than improvising a truth claim:

1. show `npm run verify:ci` / CI #273;
2. show the architecture;
3. show Candidate Run #12 and artifact `9458987801`;
4. explain the exact `NOT_RUN` / not-observed boundaries.

That still demonstrates the core product honestly and keeps the recording reproducible.
