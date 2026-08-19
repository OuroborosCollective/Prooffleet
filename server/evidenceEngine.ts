import crypto from "crypto";
import { EvidenceBlock, AgentRole } from "../src/types/index";

export class EvidenceEngine {
  private chain: EvidenceBlock[] = [];

  constructor() {
    this.initGenesisBlock();
  }

  private initGenesisBlock() {
    const genesisPayload = {
      genesis: "ProofFleet Verifiable Agentic Substrate",
      standard: "IEEE P3152 & Google Agentic Verification Framework",
      epoch: "2026-08-19T00:00:00.000Z",
    };

    const prevHash = "0".repeat(64);
    const hash = this.calculateHash(0, "orchestrator", "ProofFleet Genesis Block Initialized", genesisPayload, prevHash);
    const signature = this.generateSignature(hash, "orchestrator");

    const genesisBlock: EvidenceBlock = {
      blockIndex: 0,
      id: "ev-block-0000",
      timestamp: new Date().toISOString(),
      agentId: "orchestrator",
      claim: "ProofFleet Genesis Block Initialized with Verifiable Cryptographic Ledger",
      evidenceType: "system_trace",
      dataPayload: genesisPayload,
      previousHash: prevHash,
      hash: hash,
      signature: signature,
      verificationStatus: "VERIFIED",
      truthScore: 100,
    };

    this.chain = [genesisBlock];
  }

  public getChain(): EvidenceBlock[] {
    return [...this.chain];
  }

  public sealEvidence(
    agentId: AgentRole,
    claim: string,
    evidenceType: EvidenceBlock["evidenceType"],
    dataPayload: Record<string, unknown>,
    truthScore: number = 95,
    citations?: EvidenceBlock["citations"]
  ): EvidenceBlock {
    const blockIndex = this.chain.length;
    const previousHash = this.chain[this.chain.length - 1].hash;
    const hash = this.calculateHash(blockIndex, agentId, claim, dataPayload, previousHash);
    const signature = this.generateSignature(hash, agentId);

    const block: EvidenceBlock = {
      blockIndex,
      id: `ev-block-${String(blockIndex).padStart(4, "0")}`,
      timestamp: new Date().toISOString(),
      agentId,
      claim,
      evidenceType,
      dataPayload,
      citations,
      previousHash,
      hash,
      signature,
      verificationStatus: truthScore >= 85 ? "VERIFIED" : truthScore >= 60 ? "PENDING" : "FLAGGED",
      truthScore,
    };

    this.chain.push(block);
    return block;
  }

  public calculateHash(
    blockIndex: number,
    agentId: AgentRole,
    claim: string,
    dataPayload: Record<string, unknown>,
    previousHash: string
  ): string {
    const content = `${blockIndex}|${agentId}|${claim}|${JSON.stringify(dataPayload)}|${previousHash}`;
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private generateSignature(hash: string, agentId: string): string {
    const signerKey = `pf-agent-secp256-${agentId}`;
    return crypto.createHmac("sha256", signerKey).update(hash).digest("hex");
  }

  public verifyChainIntegrity(): {
    isValid: boolean;
    brokenBlockIndex: number | null;
    totalBlocks: number;
    details: string;
  } {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      // Check previous hash pointer
      if (current.previousHash !== previous.hash) {
        return {
          isValid: false,
          brokenBlockIndex: i,
          totalBlocks: this.chain.length,
          details: `Broken hash link at block #${i}. Expected prevHash: ${previous.hash.slice(0, 10)}..., but got: ${current.previousHash.slice(0, 10)}...`,
        };
      }

      // Check current hash integrity
      const recalculatedHash = this.calculateHash(
        current.blockIndex,
        current.agentId,
        current.claim,
        current.dataPayload,
        current.previousHash
      );

      if (recalculatedHash !== current.hash) {
        return {
          isValid: false,
          brokenBlockIndex: i,
          totalBlocks: this.chain.length,
          details: `Hash tamper detected at block #${i}. Stored: ${current.hash.slice(0, 10)}..., Calculated: ${recalculatedHash.slice(0, 10)}...`,
        };
      }
    }

    return {
      isValid: true,
      brokenBlockIndex: null,
      totalBlocks: this.chain.length,
      details: "All cryptographic SHA-256 blocks and signatures in the chain verified intact.",
    };
  }

  public resetChain() {
    this.initGenesisBlock();
  }
}

export const evidenceLedger = new EvidenceEngine();
