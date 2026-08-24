export type ChainTruthTone = "verified" | "unverified" | "neutral";

export interface ChainTruthPresentation {
  tone: ChainTruthTone;
  isVerified: boolean;
  label: string;
  description: string;
}

/**
 * A hash-consistent empty ledger is not an observed evidence chain. UI green is
 * reserved for a non-empty chain that an underlying verifier reports intact.
 */
export function deriveChainTruthPresentation(
  totalEvidenceBlocks: number | null | undefined,
  chainIntegrityValid: boolean | null | undefined,
): ChainTruthPresentation {
  const hasEvidence = typeof totalEvidenceBlocks === "number"
    && Number.isSafeInteger(totalEvidenceBlocks)
    && totalEvidenceBlocks > 0;

  if (!hasEvidence) {
    return {
      tone: "neutral",
      isVerified: false,
      label: "No evidence chain",
      description: "No sealed evidence has been observed.",
    };
  }

  if (chainIntegrityValid === true) {
    return {
      tone: "verified",
      isVerified: true,
      label: "Chain integrity intact (SHA-256)",
      description: "A non-empty chain passed the underlying integrity check.",
    };
  }

  return {
    tone: "unverified",
    isVerified: false,
    label: "Chain integrity unverified",
    description: "The chain is non-empty but has no passing integrity verdict.",
  };
}
