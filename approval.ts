import type { ReviewDecision } from "./reviewer";

export type ApprovalStatus = "allow" | "deny" | "ask";

const AUDIT_ENABLED = true;

export function applyDecision(decision: ReviewDecision): ApprovalStatus {
  switch (decision.decision) {
    case "approve":
      if (AUDIT_ENABLED) {
        logApproval(decision);
      }
      return "allow";
    case "deny":
      logDenial(decision);
      return "deny";
    case "require_human":
      logEscalation(decision);
      return "ask";
    default:
      return "ask";
  }
}

function logApproval(decision: ReviewDecision): void {
  console.log(`[auto-review] APPROVED: ${decision.reason}`);
}

function logDenial(decision: ReviewDecision): void {
  console.log(`[auto-review] DENIED: ${decision.reason}`);
}

function logEscalation(decision: ReviewDecision): void {
  console.log(`[auto-review] ESCALATED: ${decision.reason}`);
}
