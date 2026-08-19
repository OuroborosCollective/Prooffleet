import crypto from "crypto";
import { ConsentRequest, AgentRole, RiskLevel } from "../src/types/index";

export class ConsentEngine {
  private requests: Map<string, ConsentRequest> = new Map();

  public createRequest(
    agentId: AgentRole,
    actionName: string,
    targetResource: string,
    parameters: Record<string, unknown>,
    riskLevel: RiskLevel,
    riskJustification: string
  ): ConsentRequest {
    const id = `req-${crypto.randomBytes(4).toString("hex")}`;
    const request: ConsentRequest = {
      id,
      timestamp: new Date().toISOString(),
      agentId,
      actionName,
      targetResource,
      parameters,
      riskLevel,
      riskJustification,
      status: "PENDING",
    };

    this.requests.set(id, request);
    return request;
  }

  public respond(
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    operatorIdentity: string = "Admin Operator",
    reason?: string
  ): ConsentRequest | null {
    const request = this.requests.get(requestId);
    if (!request) return null;

    request.status = decision;
    request.approvedBy = operatorIdentity;
    request.decisionTimestamp = new Date().toISOString();
    request.reason = reason || (decision === "APPROVED" ? "Human consent granted after risk review." : "Action rejected by human supervisor.");

    this.requests.set(requestId, request);
    return request;
  }

  public getPendingRequests(): ConsentRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === "PENDING");
  }

  public getAllRequests(): ConsentRequest[] {
    return Array.from(this.requests.values());
  }

  public getRequest(id: string): ConsentRequest | undefined {
    return this.requests.get(id);
  }
}

export const consentManager = new ConsentEngine();
