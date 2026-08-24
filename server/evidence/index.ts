/**
 * index.ts — public surface of server/evidence (Coder A scope).
 */

export { canonicalJson } from './canonicalJson';
export {
  EvidenceLedger,
  computeBlockHash,
  sha256Hex,
  signBlockHash,
  verifyBlockSignature,
  type EvidenceBlock,
  type SealInput,
  type LedgerVerification,
} from './ledger';
export {
  ReceiptChain,
  computeReceiptHash,
  RECEIPT_GENESIS,
  type IssueReceiptInput,
  type ChainVerification,
} from './receipts';
export { MemoryStore, type MemoryEntry } from './memoryStore';
export {
  IndependentVerifier,
  type LedgerSnapshotVerification,
  type ReceiptBindingCheck,
} from './verifier';
export { Judge } from './judge';
