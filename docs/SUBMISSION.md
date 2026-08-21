# ProofFleet Submission Readiness

This checklist tracks the Devpost requirements for the **All Things Agentic Hackathon / Fortified Enterprise Fleet** without upgrading unobserved states into claims.

## Required technology gates

| Requirement | ProofFleet status | Evidence |
|---|---|---|
| Gemini 3.5 or newer | **MET IN CODE** | `gemini-3.7-flash` contract |
| Google agent framework | **MET IN CODE** | `@google/adk` dependency and ADK runtime contract |
| Google Cloud infrastructure | **LIVE OBSERVED** | Cloud Run Candidate Run #12 |
| Public/private code repository | **MET** | public GitHub repository |
| Reproducible setup instructions | **MET** | root `README.md` + `npm ci` + `npm run verify:ci` |
| Architecture diagram | **READY IN REPO** | `docs/architecture/prooffleet-architecture.svg` / `.mmd` |
| ~4-minute demo video | **MISSING** | must be a real YouTube/Vimeo URL before final submission |

## Technology answers supported by the repository

### Google SDKs

The dependency graph contains both:

```text
@google/adk
@google/genai
```

The canonical ProofFleet reasoning path is **Google ADK + Gemini 3.7 Flash**. The submission can truthfully select:

- Agent Development Kit (ADK)
- Google GenAI SDK (google-genai)

### Google Cloud services

**Cloud Run** is the service with live source-bound deployment/readback evidence.

Firestore code, optional dependency, effect executor, adapter, and a bounded manual live-proof workflow exist, but there is no current `OBSERVED` live Firestore receipt. For a conservative submission, select Cloud Run as the definitely live-used infrastructure service unless a Firestore live-proof receipt is completed before final submission.

### Google AI models

Current verified model contract:

```text
gemini-3.7-flash
```

Do not add Gemma, Veo, or Lyria merely to claim bonus points. Add another model only if it serves a real product role and gains its own test/evidence boundary.

## Public project page

Devpost project:

```text
ProofFleet
https://devpost.com/software/prooffleet
```

The public description has been updated to include:

- eight-role evidence-first architecture;
- Google ADK + Gemini 3.7 Flash;
- CI #273 / 220 tests;
- exact live-proven source `f432b111a621a4a57afe229b0f50fbb129aaa164`;
- Cloud Run revision `prooffleet-00008-lux`;
- OCI index → `linux/amd64` runtime manifest → Cloud Run readback;
- tagged HTTP health observation;
- explicit `ADK NOT_RUN` and Firestore-not-observed boundaries.

## Required custom submission fields

These fields are not all safely inferable from repository evidence and should not be guessed by automation:

- submitter type;
- submitter country of residence;
- organization name (required field even if the answer is effectively not applicable / individual, depending on Devpost form semantics);
- project start date in `MM-DD-YY` format;
- optional Startup Prize incorporated-organization name and corporate email.

Fields with repository-supported answers:

| Devpost field | Supported answer |
|---|---|
| Category | `Fortified Enterprise Fleet` |
| Code repo | `https://github.com/OuroborosCollective/Prooffleet` |
| Reproducible testing in README | `Yes` |
| Google SDK | `Agent Development Kit (ADK)` + `Google GenAI SDK (google-genai)` |
| Google Cloud service | `Cloud Run` |
| Google AI model | `Gemini 3.7 Flash` |

Hosted-project URL is optional but strongly recommended. The zero-traffic candidate URL is a proof endpoint, not a production promotion. Do not present the candidate's existence as a stable production release.

## Architecture upload

Devpost accepts the architecture diagram as:

```text
pdf / ppt / pptx / png / jpg / jpeg
```

The repository's SVG is the canonical render source. A PNG export should be attached to the Devpost submission before final submission.

## Demo video requirement

Devpost requires approximately four minutes and expects the video to show:

- problem;
- value proposition;
- app in action;
- backend running on Google Cloud (Cloud Run dashboard, `.run` URL, logs, etc.).

Use [`DEMO.md`](DEMO.md) as the recording script. The final URL must be YouTube or Vimeo. Do not claim this requirement complete until that URL exists on the project.

## Bonus points

Official optional bonus routes:

### Public build content

A public article/video/podcast about how ProofFleet was built can qualify if it explicitly says the content was created for the purpose of entering the hackathon.

Recommended angle:

> **“Why an AI agent saying ‘done’ is not evidence: building ProofFleet's source-to-runtime receipt chain.”**

High-value technical beats:

1. Actor != Verifier != Judge.
2. operation-bound consent.
3. readback-before-retry.
4. source SHA vs synthetic PR merge SHA.
5. OCI index vs runtime child-manifest identity.
6. WIF-only zero-traffic Cloud Run candidate.
7. honest `NOT_RUN` / `NOT_CONFIGURED` states.

### Social post

A public X/LinkedIn/Instagram/Facebook post can qualify. For X/LinkedIn, include:

```text
#AllThingsAgenticHackathon
```

Suggested concise factual claim set:

- built ProofFleet for Fortified Enterprise Fleet;
- eight authority-separated agents;
- 220-test CI chain;
- live source-bound Cloud Run candidate at 0% normal traffic;
- independent OCI-index → runtime-manifest → Cloud Run readback;
- explicit consent and non-mutating Judge;
- no claim that the ADK live canary ran yet.

Do not publish secret values, private operator credentials, or raw Cloud Run deploy/service JSON.

### Additional Google AI models

Optional, but not worth weakening the architecture. Only integrate an additional model if it creates real user value and can be covered by the same evidence-first discipline.

## Final submission gate

Do not call the submission finished until all of these are true:

- [x] exact live-proven app source exists;
- [x] reproducible CI chain is green;
- [x] live Google Cloud deployment/readback proof exists;
- [x] README contains spin-up instructions;
- [x] architecture diagram exists;
- [x] Devpost description is current;
- [ ] architecture PNG is attached to the Devpost submission;
- [ ] real ~4-minute YouTube/Vimeo demo is attached;
- [ ] required personal/custom fields are truthfully filled;
- [ ] project is finally submitted/re-submitted and Devpost reports `Submitted`;
- [ ] optional public content/social bonus URLs are attached if created.

Until those remaining boxes are satisfied, ProofFleet is **jury-ready in engineering evidence, but not yet administratively complete**.
