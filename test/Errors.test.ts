import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import {
  BlockedCommandError,
  RequiresHumanApprovalError,
  BlockedEditError
} from "../src/domain/Errors.js"

describe("Typed Errors", () => {
  it("creates BlockedCommandError", () => {
    const error = new BlockedCommandError({ reason: "dangerous command" })
    expect(error._tag).toBe("BlockedCommandError")
    expect(error.reason).toBe("dangerous command")
  })

  it("creates RequiresHumanApprovalError", () => {
    const error = new RequiresHumanApprovalError({ reason: "needs approval" })
    expect(error._tag).toBe("RequiresHumanApprovalError")
    expect(error.reason).toBe("needs approval")
  })

  it("creates BlockedEditError", () => {
    const error = new BlockedEditError({ reason: "sensitive path" })
    expect(error._tag).toBe("BlockedEditError")
    expect(error.reason).toBe("sensitive path")
  })

  it("errors are pattern matchable", () => {
    const program = Effect.fail(new BlockedCommandError({ reason: "test" }))
    
    const result = Effect.runSyncExit(
      Effect.catchAll(program, (error) => {
        if (error._tag === "BlockedCommandError") {
          return Effect.succeed("caught blocked command")
        }
        return Effect.succeed("other error")
      })
    )
    
    expect(result._tag).toBe("Success")
  })
})
