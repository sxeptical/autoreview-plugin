import { Context, Effect, Layer } from "effect"
import { ReviewDecision } from "../domain/ReviewDecision.js"

export type ApprovalStatus = "allow" | "deny" | "ask"

export class Approval extends Context.Tag("Approval")<
  Approval,
  {
    readonly applyDecision: (decision: ReviewDecision) => Effect.Effect<ApprovalStatus, never>
  }
>() {}

export const ApprovalLive = Layer.succeed(
  Approval,
  {
    applyDecision: (decision: ReviewDecision) =>
      Effect.sync(() => {
        switch (decision.decision) {
          case "approve":
            console.log(`[auto-review] APPROVED: ${decision.reason}`)
            return "allow"
          case "deny":
            console.log(`[auto-review] DENIED: ${decision.reason}`)
            return "deny"
          case "require_human":
            console.log(`[auto-review] ESCALATED: ${decision.reason}`)
            return "ask"
        }
      }),
  }
)
