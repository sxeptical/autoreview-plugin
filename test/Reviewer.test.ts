import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { Reviewer, ReviewerLive } from "../src/services/Reviewer.js"

describe("Reviewer Service", () => {
  it("denies dangerous bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("rm -rf /etc")
      
      expect(result.decision).toBe("deny")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("approves safe bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("ls -la")
      
      expect(result.decision).toBe("approve")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates unknown bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("custom-command")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates compound commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("ls | grep foo")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates edits to sensitive paths", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewEdit("/etc/passwd")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("approves edits to safe paths", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewEdit("/home/user/project/file.ts")
      
      expect(result.decision).toBe("approve")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
})
