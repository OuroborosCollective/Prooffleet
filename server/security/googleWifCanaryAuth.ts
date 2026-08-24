import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export const ADK_WIF_CANARY_INTENT = "I_APPROVE_PROOFFLEET_ADK_CANARY";
export const ADK_WIF_CANARY_PRINCIPAL =
  "prooffleet-deploy@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com";

export type GoogleWifCanaryAuthFailure =
  | "wif_canary_authorization_missing"
  | "wif_canary_authorization_malformed"
  | "wif_canary_host_invalid"
  | "wif_canary_source_invalid"
  | "wif_canary_source_mismatch"
  | "wif_canary_token_invalid"
  | "wif_canary_principal_mismatch";

export class GoogleWifCanaryAuthError extends Error {
  constructor(readonly code: GoogleWifCanaryAuthFailure) {
    super(code);
  }
}

export interface VerifiedGoogleIdToken {
  email: string | null;
  emailVerified: boolean;
  subject: string | null;
}

export interface GoogleWifCanaryAuthority {
  kind: "google-wif";
  principalSha256: string;
  subjectSha256: string;
  audienceSha256: string;
  sourceRevision: string;
}

export interface GoogleWifCanaryAuthInput {
  authorization: string | undefined;
  host: string | undefined;
  requestSourceRevision: string | undefined;
  runtimeSourceRevision: string | undefined;
}

export interface GoogleWifCanaryAuthDependencies {
  verifyIdToken?: (idToken: string, audience: string) => Promise<VerifiedGoogleIdToken>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactSourceRevision(value: string | undefined): string | null {
  return value && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function cloudRunAudience(host: string | undefined): string {
  const normalized = host?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9][a-z0-9.-]*\.a\.run\.app$/.test(normalized)) {
    throw new GoogleWifCanaryAuthError("wif_canary_host_invalid");
  }
  return `https://${normalized}`;
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new GoogleWifCanaryAuthError("wif_canary_authorization_missing");
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization.trim());
  if (!match) {
    throw new GoogleWifCanaryAuthError("wif_canary_authorization_malformed");
  }
  return match[1];
}

async function verifyWithGoogle(
  idToken: string,
  audience: string,
): Promise<VerifiedGoogleIdToken> {
  const client = new OAuth2Client();
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("missing token payload");
    }
    return {
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
      subject: typeof payload.sub === "string" ? payload.sub : null,
    };
  } catch {
    throw new GoogleWifCanaryAuthError("wif_canary_token_invalid");
  }
}

/**
 * Authorizes only the bounded, tool-less ADK runtime canary.
 *
 * This is deliberately separate from operator-session authority: the caller
 * must present a Google-signed ID token for the exact Cloud Run tagged URL,
 * the token must identify the already-provisioned ProofFleet deploy service
 * account, and the request must bind to the exact runtime source revision.
 * The resulting authority object contains only hashes; bearer tokens and raw
 * token payloads are never returned or persisted.
 */
export async function verifyGoogleWifCanaryAuthority(
  input: GoogleWifCanaryAuthInput,
  dependencies: GoogleWifCanaryAuthDependencies = {},
): Promise<GoogleWifCanaryAuthority> {
  const runtimeSourceRevision = exactSourceRevision(input.runtimeSourceRevision);
  const requestSourceRevision = exactSourceRevision(input.requestSourceRevision);
  if (!runtimeSourceRevision || !requestSourceRevision) {
    throw new GoogleWifCanaryAuthError("wif_canary_source_invalid");
  }
  if (runtimeSourceRevision !== requestSourceRevision) {
    throw new GoogleWifCanaryAuthError("wif_canary_source_mismatch");
  }

  const audience = cloudRunAudience(input.host);
  const idToken = bearerToken(input.authorization);
  const verifier = dependencies.verifyIdToken ?? verifyWithGoogle;

  let verified: VerifiedGoogleIdToken;
  try {
    verified = await verifier(idToken, audience);
  } catch (error) {
    if (error instanceof GoogleWifCanaryAuthError) throw error;
    throw new GoogleWifCanaryAuthError("wif_canary_token_invalid");
  }

  if (
    !verified.emailVerified ||
    verified.email !== ADK_WIF_CANARY_PRINCIPAL ||
    !verified.subject
  ) {
    throw new GoogleWifCanaryAuthError("wif_canary_principal_mismatch");
  }

  return {
    kind: "google-wif",
    principalSha256: sha256(ADK_WIF_CANARY_PRINCIPAL),
    subjectSha256: sha256(verified.subject),
    audienceSha256: sha256(audience),
    sourceRevision: runtimeSourceRevision,
  };
}
