import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { AutoReviewPlugin } from "../src/index.js"
import { handlePermissionAsk } from "../src/plugin/hooks.js"
import { ApprovalLive } from "../src/services/Approval.js"
import { ReviewedStateLive } from "../src/services/ReviewedState.js"
import { ReviewerLive } from "../src/services/Reviewer.js"

const AppLayer = Layer.mergeAll(ReviewerLive, ApprovalLive, ReviewedStateLive)

const pluginInput = {
  client: {},
  directory: "/workspace",
  worktree: "/workspace",
} as never

describe("Plugin hooks", () => {
  it("returns promises from OpenCode hook handlers", async () => {
    const hooks = await AutoReviewPlugin(pluginInput)

    const permissionOutput = { status: "ask" as "allow" | "deny" | "ask" }
    const permissionResult = hooks["permission.ask"](
      {
        id: "permission-1",
        type: "bash",
        pattern: "git status",
        sessionID: "session-1",
        messageID: "message-1",
        title: "bash command",
        metadata: {},
        time: { created: Date.now() },
      } as never,
      permissionOutput as never,
    )

    expect(permissionResult).toBeInstanceOf(Promise)
    await permissionResult

    const beforeResult = hooks["tool.execute.before"](
      { tool: "bash", callID: "call-1" } as never,
      { args: { command: "git status" } } as never,
    )

    expect(beforeResult).toBeInstanceOf(Promise)
    await beforeResult

    const afterResult = hooks["tool.execute.after"](
      { tool: "bash", callID: "call-1" } as never,
      { output: "" } as never,
    )

    expect(afterResult).toBeInstanceOf(Promise)
    await afterResult
  })

  it("allows edit permission checks without a concrete path", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "permission-2",
          type: "edit",
          sessionID: "session-1",
          messageID: "message-1",
          title: "file edit",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      ).pipe(Effect.provide(AppLayer)),
    )

    expect(output.status).toBe("allow")
  })

  it("allows external directory permission checks without a concrete path", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "permission-3",
          type: "external_directory",
          sessionID: "session-1",
          messageID: "message-1",
          title: "external directory access",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      ).pipe(Effect.provide(AppLayer)),
    )

    expect(output.status).toBe("allow")
  })
})
