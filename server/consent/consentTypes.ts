/**
 * consentTypes.ts — Re-Export der Consent-Typen (Dedupe, SPEC §6).
 *
 * EINE Definition lebt in src/types/index.ts (SPEC §1 + Integration):
 * OperationSpec, ConsentGrant, ConsentStatus, ConsentRequest, RiskLevel,
 * ConsentDecision, GrantValidation. Dieses Modul re-exportiert nur, damit
 * bestehende Importpfade server/consent/* stabil bleiben.
 */

export type {
  ConsentGrant,
  ConsentStatus,
  OperationSpec,
  ConsentRequest,
  ConsentDecision,
  GrantValidation,
  RiskLevel,
} from '../../src/types/index';
