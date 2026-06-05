import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { Approval, ApprovalLive } from "../src/services/Approval.js"
import { ReviewDecision } from "../src/domain/ReviewDecision.js"

describe("Approval Service", () => {
  it("returns allow for approve decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "approve", reason: "safe" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("allow")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))

  it("returns deny for deny decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "deny", reason: "dangerous" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("deny")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))

  it("returns ask for require_human decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "require_human", reason: "needs approval" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("ask")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))
})
