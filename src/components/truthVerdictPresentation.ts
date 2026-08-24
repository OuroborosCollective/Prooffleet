export type TruthJudgeVerdict =
  | "VERIFIED"
  | "BLOCKED_BY_MISSING_EVIDENCE"
  | "CONTRADICTED";

export type TruthVerdictTone =
  | "verified"
  | "blocked"
  | "contradicted"
  | "not_verified";

export interface TruthVerdictPresentation {
  status:
    | "VERIFIED"
    | "BLOCKED_BY_MISSING_EVIDENCE"
    | "CONTRADICTED"
    | "NOT_VERIFIED";
  tone: TruthVerdictTone;
  isVerified: boolean;
  heading: string;
  description: string;
}

/**
 * The UI may call a mission verified only when the Judge, chain integrity, and
 * policy gate agree. A true-looking component must never upgrade a weaker
 * underlying verdict.
 */
export function deriveTruthVerdictPresentation(
  judgeVerdict: TruthJudgeVerdict,
  integrityVerified: boolean,
  compliancePassed: boolean,
): TruthVerdictPresentation {
  if (judgeVerdict === "VERIFIED" && integrityVerified && compliancePassed) {
    return {
      status: "VERIFIED",
      tone: "verified",
      isVerified: true,
      heading: "Verified Mission Audit Report",
      description: "Judge verdict, chain integrity, and policy gate agree.",
    };
  }

  if (judgeVerdict === "CONTRADICTED") {
    return {
      status: "CONTRADICTED",
      tone: "contradicted",
      isVerified: false,
      heading: "Contradicted Mission Audit Report",
      description: "Conflicting or invalid evidence blocks a verified claim.",
    };
  }

  if (judgeVerdict === "BLOCKED_BY_MISSING_EVIDENCE") {
    return {
      status: "BLOCKED_BY_MISSING_EVIDENCE",
      tone: "blocked",
      isVerified: false,
      heading: "Blocked Mission Audit Report",
      description: "Required evidence is missing; the mission is not verified.",
    };
  }

  return {
    status: "NOT_VERIFIED",
    tone: "not_verified",
    isVerified: false,
    heading: "Unverified Mission Audit Report",
    description: "The Judge alone is insufficient because integrity or policy gates failed.",
  };
}

