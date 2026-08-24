# ProofFleet GCP-Adapter — Provisionierungs-Runbook

Grundlage der offiziellen Provisionierungsliste. Alle Adapter melden ehrlich
`NOT_PROVISIONED`, solange Konfiguration, API, Ressource oder IAM fehlt — es gibt
keine Simulation. `readback()` liefert nur dann `ok: true`, wenn ein echter Call
gegen die echte GCP-API erfolgreich war. Credentials ausschliesslich ueber
Application Default Credentials (ADC); niemals Keys im Code.

Gemeinsame Voraussetzungen:

```bash
export PROJECT_ID=<ihr-projekt>
export REGION=europe-west1
gcloud config set project $PROJECT_ID
# ADC fuer lokale Laeufe (in Cloud Run/GKE entfaellt das via Workload Identity):
gcloud auth application-default login
# Runtime-Service-Account:
gcloud iam service-accounts create prooffleet-runtime \
  --display-name="ProofFleet Runtime"
export RUNTIME_SA=prooffleet-runtime@$PROJECT_ID.iam.gserviceaccount.com
```

Gemeinsame Env-Vars: `GCP_PROJECT_ID`, `GCP_REGION`.

---

## 1. Firestore (`firestore.ts`)

1. **APIs:** `gcloud services enable firestore.googleapis.com`
2. **Provisionierung:**
   ```bash
   gcloud firestore databases create --location=$REGION --type=firestore-native
   # Readback-Probe-Dokument (optional; exists=false ist trotzdem verifiziert):
   # Collection 'prooffleet_evidence', Dokument 'prooffleet-readback-probe'
   ```
3. **IAM (Runtime-SA):** `roles/datastore.user` (Minimal: `datastore.entities.get`)
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/datastore.user
   ```
4. **Env:** `GCP_PROJECT_ID`, `PROOFFLEET_FIRESTORE_COLLECTION`
5. **readback() ruft:** echten `document get` auf
   `<PROOFFLEET_FIRESTORE_COLLECTION>/prooffleet-readback-probe` via
   `@google-cloud/firestore` (ADC).
6. **Akzeptanz PROVISIONED_VERIFIED:** `get()` liefert eine echte Antwort ohne
   Fehler (Dokument darf nicht existieren — `exists=false` zaehlt als verifiziert).

## 2. Secret Manager (`secretmanager.ts`)

1. **APIs:** `gcloud services enable secretmanager.googleapis.com`
2. **Provisionierung:**
   ```bash
   echo -n "<secret-wert>" | gcloud secrets create prooffleet-runtime-secret \
     --replication-policy=automatic --data-file=-
   ```
3. **IAM (Runtime-SA):** `roles/secretmanager.secretAccessor` (nur auf dieses Secret)
   ```bash
   gcloud secrets add-iam-policy-binding prooffleet-runtime-secret \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
   ```
4. **Env:** `GCP_PROJECT_ID`, `PROOFFLEET_SECRET_NAME`
5. **readback() ruft:** echten `accessSecretVersion` auf
   `projects/<p>/secrets/<name>/versions/latest` via `@google-cloud/secret-manager`.
   Der Secret-Wert wird niemals geloggt (nur Laenge).
6. **Akzeptanz PROVISIONED_VERIFIED:** `accessSecretVersion` erfolgreich; es wird
   eine aktivierte Version mit Payload zurueckgeliefert.

## 3. Pub/Sub (`pubsub.ts`)

1. **APIs:** `gcloud services enable pubsub.googleapis.com`
2. **Provisionierung:**
   ```bash
   gcloud pubsub topics create prooffleet-evidence
   ```
3. **IAM (Runtime-SA):** `roles/pubsub.publisher` + `roles/pubsub.viewer`
   (Readback braucht `pubsub.topics.get`)
   ```bash
   gcloud pubsub topics add-iam-policy-binding prooffleet-evidence \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/pubsub.publisher
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/pubsub.viewer
   ```
4. **Env:** `GCP_PROJECT_ID`, `PROOFFLEET_PUBSUB_TOPIC`
5. **readback() ruft:** echten `topic.get()` via `@google-cloud/pubsub`.
6. **Akzeptanz PROVISIONED_VERIFIED:** `topic.get()` erfolgreich (Topic existiert
   und ist lesbar).

## 4. Cloud Run (`cloudrun.ts`)

1. **APIs:** `gcloud services enable run.googleapis.com`
2. **Provisionierung:**
   ```bash
   gcloud run deploy prooffleet-api \
     --image=<REGION>-docker.pkg.dev/$PROJECT_ID/prooffleet/api:latest \
     --region=$REGION --service-account=$RUNTIME_SA --no-allow-unauthenticated
   ```
3. **IAM (Runtime-SA):** `roles/run.viewer` (Readback braucht `run.services.get`)
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/run.viewer
   ```
4. **Env:** `GCP_PROJECT_ID`, `GCP_REGION`, `PROOFFLEET_CLOUDRUN_SERVICE`
5. **readback() ruft:** echten `services.get` (Cloud Run Admin API v2) auf
   `projects/<p>/locations/<r>/services/<name>` via `@google-cloud/run`.
6. **Akzeptanz PROVISIONED_VERIFIED:** `getService` erfolgreich; Service-URI wird
   zurueckgeliefert.

## 5. Model Armor (`modelarmor.ts`)

1. **APIs:** `gcloud services enable modelarmor.googleapis.com`
2. **Provisionierung:**
   ```bash
   gcloud model-armor templates create prooffleet-guard \
     --location=$REGION \
     --rai-settings-filters='[{"filterType":"HATE_SPEECH","confidenceLevel":"MEDIUM_AND_ABOVE"}]' \
     --pi-and-jailbreak-filter-settings-enforcement=enabled
   ```
   (Alternativ via Console: Security > Model Armor > Template anlegen.)
3. **IAM (Runtime-SA):** `roles/modelarmor.user` (Readback braucht
   `modelarmor.templates.get` + `modelarmor.userPrompts.sanitize`)
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/modelarmor.user
   ```
4. **Env:** `GCP_PROJECT_ID`, `GCP_REGION`, `PROOFFLEET_MODEL_ARMOR_TEMPLATE`
5. **readback() ruft:** echten `templates.get` **und** einen echten
   `sanitizeUserPrompt`-Testaufruf mit harmlosem Probe-Text via
   `@google-cloud/modelarmor` (regionaler Endpoint `modelarmor.<region>.rep.googleapis.com`).
6. **Akzeptanz PROVISIONED_VERIFIED:** `templates.get` erfolgreich **und**
   `sanitizeUserPrompt` liefert ein Sanitization-Result ohne API-Fehler.

## 6. ADK / Vertex AI Agent Engine (`adk.ts`)

1. **APIs:** `gcloud services enable aiplatform.googleapis.com`
2. **Provisionierung:**
   ```bash
   # Staging-Bucket fuer Agent Engine:
   gcloud storage buckets create gs://$PROJECT_ID-agent-engine --location=$REGION
   # Agent deployen (aus ADK-Projektverzeichnis):
   adk deploy agent_engine --project=$PROJECT_ID --region=$REGION \
     --staging_bucket=gs://$PROJECT_ID-agent-engine ./prooffleet_agent
   # -> Reasoning-Engine-ID notieren (ADK_AGENT_ENGINE_ID)
   ```
3. **IAM (Runtime-SA):** `roles/aiplatform.user` (Readback braucht
   `aiplatform.reasoningEngines.get`)
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/aiplatform.user
   ```
4. **Env:** `GCP_PROJECT_ID`, `GCP_REGION`, `ADK_AGENT_ENGINE_ID`
5. **readback() ruft:** echten Agent-Engine-Ping `reasoningEngines.get` auf
   `projects/<p>/locations/<r>/reasoningEngines/<id>` via
   `@google-cloud/aiplatform` (regionaler Endpoint `<region>-aiplatform.googleapis.com`).
6. **Akzeptanz PROVISIONED_VERIFIED:** `getReasoningEngine` erfolgreich; Engine-
   Name/DisplayName wird zurueckgeliefert.

## 7. OpenTelemetry (`otel.ts`)

1. **APIs:** `gcloud services enable telemetry.googleapis.com cloudtrace.googleapis.com`
   (bzw. kein API-Zwang bei eigenem OTLP-Collector)
2. **Provisionierung:**
   ```bash
   # Option A: Google Cloud Trace direkt (OTLP-Endpoint von Cloud Trace),
   # Option B: eigener Collector auf Cloud Run:
   gcloud run deploy prooffleet-otel-collector \
     --image=otel/opentelemetry-collector-contrib:latest \
     --region=$REGION --port=4318
   export OTEL_ENDPOINT=https://<collector-url>   # HTTP-OTLP (4318)
   ```
3. **IAM (Runtime-SA):** bei Export nach Cloud Trace `roles/cloudtrace.agent`,
   bei eigenem Collector keine GCP-Rolle noetig (nur Netzwerkzugang).
   ```bash
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/cloudtrace.agent
   ```
4. **Env:** `OTEL_ENABLED=true`, `OTEL_EXPORTER_OTLP_ENDPOINT`
   (ohne beide: Adapter ist bewusst no-op und meldet NOT_PROVISIONED)
5. **readback() ruft:** (a) echten HTTP-Request an den OTLP-Endpoint
   (`/v1/traces`, Erreichbarkeit) und (b) Trace-Export-Verifizierung: ein echter
   Span `prooffleet.otel.readback` wird ueber das initialisierte NodeSDK
   (`@opentelemetry/sdk-node` + OTLP-HTTP-Exporter) erzeugt und per forceFlush
   exportiert.
6. **Akzeptanz PROVISIONED_VERIFIED:** Collector-Endpoint antwortet real (< HTTP
   500) **und** der Span-Export via forceFlush laeuft ohne Fehler durch.

---

## Runtime-Abhaengigkeiten (nur installieren, wenn Dienst genutzt wird)

`@google-cloud/firestore`, `@google-cloud/secret-manager`, `@google-cloud/pubsub`,
`@google-cloud/run`, `@google-cloud/modelarmor`, `@google-cloud/aiplatform`,
`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/api`.

Fehlende Pakete fuehren zu ehrlichem `NOT_PROVISIONED` / `ok:false` — niemals zu
einem Crash und niemals zu einem falschen Erfolg.
