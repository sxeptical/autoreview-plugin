import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { ReviewDecision, DecisionType } from "../src/domain/ReviewDecision.js"

describe("ReviewDecision", () => {
  it("creates valid approve decision", () => {
    const decision = new ReviewDecision({
      decision: "approve",
      reason: "safe command"
    })
    expect(decision.decision).toBe("approve")
    expect(decision.reason).toBe("safe command")
  })

  it("creates valid deny decision", () => {
    const decision = new ReviewDecision({
      decision: "deny",
      reason: "dangerous command"
    })
    expect(decision.decision).toBe("deny")
  })

  it("creates valid require_human decision", () => {
    const decision = new ReviewDecision({
      decision: "require_human",
      reason: "needs approval"
    })
    expect(decision.decision).toBe("require_human")
  })

  it("rejects invalid decision type", () => {
    expect(() => {
      new ReviewDecision({
        decision: "invalid" as any,
        reason: "test"
      })
    }).toThrow()
  })
})
