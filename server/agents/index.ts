/**
 * index.ts — Fleet-Registry: alle acht wirklich getrennten Rollen.
 */

import type { FleetAgent } from './base';
import { orchestratorAgent } from './orchestrator';
import { scoutAgent } from './scout';
import { builderAgent } from './builder';
import { analystAgent } from './analyst';
import { sentinelAgent } from './sentinel';
import { auditorAgent } from './auditor';
import { gatekeeperAgent } from './gatekeeper';
import { operatorAgent } from './operator';

export const FLEET: FleetAgent[] = [
  orchestratorAgent,
  scoutAgent,
  builderAgent,
  analystAgent,
  sentinelAgent,
  auditorAgent,
  gatekeeperAgent,
  operatorAgent,
];

export * from './base';
export { orchestratorAgent, createOrchestratorAgent } from './orchestrator';
export { scoutAgent, createScoutAgent } from './scout';
export { builderAgent, createBuilderAgent } from './builder';
export { analystAgent, createAnalystAgent } from './analyst';
export { sentinelAgent, createSentinelAgent } from './sentinel';
export { auditorAgent, createAuditorAgent } from './auditor';
export { gatekeeperAgent, createGatekeeperAgent } from './gatekeeper';
export { operatorAgent, createOperatorAgent } from './operator';
