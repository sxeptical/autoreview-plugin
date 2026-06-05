import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { ReviewedState, ReviewedStateLive } from "../src/services/ReviewedState.js"

describe("ReviewedState Service", () => {
  it("tracks and checks reviewed calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.track("call-1")
      const isReviewed = yield* state.isReviewed("call-1")
      
      expect(isReviewed).toBe(true)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("returns false for untracked calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      const isReviewed = yield* state.isReviewed("unknown")
      
      expect(isReviewed).toBe(false)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("clears reviewed calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.track("call-1")
      yield* state.clear("call-1")
      const isReviewed = yield* state.isReviewed("call-1")
      
      expect(isReviewed).toBe(false)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("tracks and retrieves decisions", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.trackDecision("call-1", "approve")
      const decision = yield* state.getDecision("call-1")
      
      expect(decision).toBe("approve")
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("clears decisions", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.trackDecision("call-1", "approve")
      yield* state.clearDecision("call-1")
      const decision = yield* state.getDecision("call-1")
      
      expect(decision).toBeUndefined()
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))
})
