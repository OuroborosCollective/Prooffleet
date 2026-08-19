# Runbook: Consent & Operation Execution (Coder B)

## Consent-Bindung (consent/consentEngine.ts)
- `createRequest(spec, riskLevel, justification)` erzeugt einen PENDING-Request
  mit `operationHash = sha256Hex(canonicalJson(spec))`. Der Hash bindet die
  Entscheidung an GENAU diese Operation: operationId, kind, actionName,
  targetResource, parameters, parametersHash, missionId, missionRevision.
- `respond(requestId, decision, operatorIdentity, reason?)` ist der EINZIGE
  Weg zu einem Grant. Kein Auto-Approve, kein Timeout-Approve, kein Timer.
  Unbekannte oder bereits entschiedene Requests liefern `null`.
- Grants laufen ab (Default 5 min, `grantTtlMs`).
- `validateGrantForOperation(grant, spec)` prueft: operationHash-Match,
  `decision === 'APPROVED'`, `expiresAt` nicht ueberschritten —
  Ergebnis `{ valid, reason }`.

## Idempotency-Semantik (ops/operationExecutor.ts)
- Interne Map `operationId -> finales OperationResult`. Ein wiederholter
  `execute()` mit derselben operationId liefert das gespeicherte Result —
  `handler.apply`/`handler.readback` werden NICHT erneut aufgerufen.
  Finale Stati: `applied`, `already_applied`, `blocked_consent_required`,
  `failed`.

## Readback-Vertrag
- `readback(spec)` liefert den echten Zustand der Zielressource:
  - `null`/`undefined` → Zielzustand NICHT erreicht.
  - `{ applied: boolean, ... }` → `applied` entscheidet, Rest ist Evidence.
  - sonstiger truthy Wert → Zielzustand erreicht, Wert ist Evidence.
- `write`/`execute`: Readback laeuft VOR Erstversuch und VOR jedem Retry.
  Zeigt er den Zielzustand, Status `already_applied`, KEIN apply.
  Nach `apply` wird per Readback bestaetigt; sonst Retry (max. 3 Versuche,
  exponential backoff `base * 2^(n-1)`, sleep injizierbar).
- `read`: kein Grant noetig; der Readback selbst ist das Ergebnis.

## Fehlerfaelle
- Fehlender/invalider/abgelaufener Grant bei `write`/`execute` →
  `blocked_consent_required`, attempts = 0, kein apply.
- `apply` wirft oder Readback bestaetigt nicht → Retry; nach max. Versuchen
  `failed` mit `error`-Text (auch bei Readback-Fehlern).
