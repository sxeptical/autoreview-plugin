import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { AutoReviewPlugin } from "../src/index.js"
import { handlePermissionAsk, handleToolExecuteBefore, trackingKey } from "../src/plugin/hooks.js"
import { ApprovalLive } from "../src/services/Approval.js"
import { ReviewedStateLive, ReviewedState } from "../src/services/ReviewedState.js"
import { ReviewerLive } from "../src/services/Reviewer.js"
import { RepoConfig } from "../src/domain/RepoConfig.js"

const REPO_ROOT = "/workspace"

const AppLayer = Layer.mergeAll(
  ReviewerLive,
  ApprovalLive,
  ReviewedStateLive,
  Layer.succeed(RepoConfig, { repoRoot: REPO_ROOT }),
)

const pluginInput = {
  client: {},
  directory: REPO_ROOT,
  worktree: REPO_ROOT,
} as never

describe("Plugin hooks", () => {
  it("returns promises from OpenCode hook handlers", async () => {
    const hooks = await AutoReviewPlugin(pluginInput)

    const permissionOutput = { status: "ask" as "allow" | "deny" | "ask" }
    const permissionResult = hooks["permission.ask"]!(
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

    const beforeResult = hooks["tool.execute.before"]!(
      { tool: "bash", callID: "call-1" } as never,
      { args: { command: "git status" } } as never,
    )

    expect(beforeResult).toBeInstanceOf(Promise)
    await beforeResult

    const afterResult = hooks["tool.execute.after"]!(
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

describe("write tool hook handling (Fix 5)", () => {
  it("allows write to a safe .ts file", async () => {
    const result = await Effect.runPromise(
      handleToolExecuteBefore(
        { tool: "write", callID: "write-1" },
        { args: { filePath: "src/app.ts", content: "export const x = 1;" } },
      ).pipe(Effect.provide(AppLayer)),
    )
    // No error means approve/require_human that passed
    expect(result).toBeUndefined()
  })

  it("escalates write to sensitive config file", async () => {
    await expect(
      Effect.runPromise(
        handleToolExecuteBefore(
          { tool: "write", callID: "write-2" },
          { args: { filePath: "tsconfig.json", content: "{}" } },
        ).pipe(Effect.provide(AppLayer)),
      ),
    ).rejects.toThrow()
  })

  it("handles write tool with 'path' arg instead of 'filePath'", async () => {
    // OpenCode write tool may use 'path' instead of 'filePath'
    const result = await Effect.runPromise(
      handleToolExecuteBefore(
        { tool: "write", callID: "write-3" },
        { args: { path: "src/helper.ts", content: "export {}" } },
      ).pipe(Effect.provide(AppLayer)),
    )
    expect(result).toBeUndefined()
  })

  it("skip when write tool has no filePath/path arg", async () => {
    const result = await Effect.runPromise(
      handleToolExecuteBefore(
        { tool: "write", callID: "write-4" },
        { args: {} },
      ).pipe(Effect.provide(AppLayer)),
    )
    expect(result).toBeUndefined()
  })
})

describe("tracking key consistency (Fix 6)", () => {
  // Use a shared layer so state persists across operations within a test
  const SharedAppLayer = Layer.mergeAll(
    ReviewerLive,
    ApprovalLive,
    ReviewedStateLive,
    Layer.succeed(RepoConfig, { repoRoot: REPO_ROOT }),
  )

  it("uses callID when present", () => {
    expect(trackingKey({ id: "perm-1", callID: "call-abc" })).toBe("call-abc")
  })

  it("falls back to id when callID is absent", () => {
    expect(trackingKey({ id: "perm-2" })).toBe("perm-2")
  })

  it("uses callID even when it is empty string (intentional)", () => {
    // An empty string callID is a valid explicit value from OpenCode
    expect(trackingKey({ id: "perm-3", callID: "" })).toBe("")
  })

  it("tool.execute.before uses consistent callID as key", async () => {
    // The flow: permission.ask tracks a decision, then tool.execute.before
    // checks it via getDecision. Verify the callID is used consistently.
    const program = Effect.gen(function* () {
      const state = yield* ReviewedState

      // 1. permission.ask tracks a "deny" decision under this callID
      yield* handlePermissionAsk(
        {
          id: "tool-perm-1",
          callID: "tool-track-1",
          type: "bash",
          pattern: "rm -rf /",
          sessionID: "s1",
          messageID: "m1",
          title: "dangerous",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        { status: "ask" },
      )

      // 2. tool.execute.before should find the pre-tracked decision
      //    and re-raise the deny (via RequiresHumanApprovalError since
      //    it's "require_human" from permission.ask's perspective, or
      //    BlockedCommandError if the bash review itself says deny).
      const err = yield* handleToolExecuteBefore(
        { tool: "bash", callID: "tool-track-1" },
        { args: { command: "rm -rf /" } },
      ).pipe(Effect.catchAll(Effect.succeed))

      // The decision should have been tracked under the callID
      const decision = yield* state.getDecision("tool-track-1")
      return { decision, err }
    })

    const { decision } = await Effect.runPromise(
      program.pipe(Effect.provide(SharedAppLayer)),
    )

    expect(decision).toBe("deny")
  })

  it("permission.ask tracks decision with consistent key", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    const program = Effect.gen(function* () {
      const state = yield* ReviewedState

      yield* handlePermissionAsk(
        {
          id: "perm-track-1",
          callID: "perm-track-call-1",
          type: "bash",
          pattern: "rm -rf /",
          sessionID: "s1",
          messageID: "m1",
          title: "dangerous",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      )

      const decision = yield* state.getDecision("perm-track-call-1")
      return decision
    })

    const decision = await Effect.runPromise(
      program.pipe(Effect.provide(SharedAppLayer)),
    )

    // The decision should be tracked under the callID (preferred over id)
    expect(decision).toBe("deny")
    expect(output.status).toBe("deny")
  })

  it("permission.ask without callID tracks under id", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    const program = Effect.gen(function* () {
      const state = yield* ReviewedState

      yield* handlePermissionAsk(
        {
          id: "perm-id-only-1",
          type: "bash",
          pattern: "git status",
          sessionID: "s1",
          messageID: "m1",
          title: "safe",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      )

      const decision = yield* state.getDecision("perm-id-only-1")
      return decision
    })

    const decision = await Effect.runPromise(
      program.pipe(Effect.provide(SharedAppLayer)),
    )

    expect(decision).toBe("approve")
  })
})

describe("plugin export (Fix 1)", () => {
  it("exports server as the plugin function", async () => {
    const mod = await import("../src/index.js")
    expect(typeof mod.server).toBe("function")
    expect(typeof mod.default).toBe("function")
    expect(typeof mod.AutoReviewPlugin).toBe("function")
    // server should be the same reference as AutoReviewPlugin
    expect(mod.server).toBe(mod.AutoReviewPlugin)
  })
})

describe("repo root wiring through hooks (Fix 4 completion)", () => {
  // Build a layer with a specific repoRoot so we can prove that the
  // hooks actually thread it through to the Reviewer.
  const WorkspaceLayer = Layer.mergeAll(
    ReviewerLive,
    ApprovalLive,
    ReviewedStateLive,
    Layer.succeed(RepoConfig, { repoRoot: "/workspace" }),
  )

  it("blocks edit to absolute path outside repo root via tool.execute.before", async () => {
    // /etc/passwd is absolute and outside /workspace — should be blocked
    await expect(
      Effect.runPromise(
        handleToolExecuteBefore(
          { tool: "edit", callID: "edit-outside-1" },
          { args: { filePath: "/etc/passwd", oldString: "a", newString: "b" } },
        ).pipe(Effect.provide(WorkspaceLayer)),
      ),
    ).rejects.toThrow()
  })

  it("allows edit to relative path inside repo root via tool.execute.before", async () => {
    // Relative path resolved against /workspace stays inside the repo
    const result = await Effect.runPromise(
      handleToolExecuteBefore(
        { tool: "edit", callID: "edit-inside-1" },
        { args: { filePath: "src/helper.ts", oldString: "a", newString: "b" } },
      ).pipe(Effect.provide(WorkspaceLayer)),
    )
    expect(result).toBeUndefined()
  })

  it("blocks write to absolute path outside repo root via tool.execute.before", async () => {
    await expect(
      Effect.runPromise(
        handleToolExecuteBefore(
          { tool: "write", callID: "write-outside-1" },
          { args: { filePath: "/etc/passwd", content: "evil" } },
        ).pipe(Effect.provide(WorkspaceLayer)),
      ),
    ).rejects.toThrow()
  })

  it("allows write to relative path inside repo root via tool.execute.before", async () => {
    const result = await Effect.runPromise(
      handleToolExecuteBefore(
        { tool: "write", callID: "write-inside-1" },
        { args: { filePath: "src/app.ts", content: "export {}" } },
      ).pipe(Effect.provide(WorkspaceLayer)),
    )
    expect(result).toBeUndefined()
  })

  it("blocks edit to absolute path outside repo root via permission.ask", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "perm-outside-1",
          type: "edit",
          pattern: "/etc/passwd",
          sessionID: "s1",
          messageID: "m1",
          title: "edit outside",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      ).pipe(Effect.provide(WorkspaceLayer)),
    )

    // Should NOT be "allow" — path escapes the repo
    expect(output.status).not.toBe("allow")
  })

  it("allows edit to in-repo path via permission.ask", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "perm-inside-1",
          type: "edit",
          pattern: "src/helper.ts",
          sessionID: "s1",
          messageID: "m1",
          title: "edit inside",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      ).pipe(Effect.provide(WorkspaceLayer)),
    )

    expect(output.status).toBe("allow")
  })

  it("external_directory outside repo root is escalated via permission.ask", async () => {
    const output = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "perm-ext-outside-1",
          type: "external_directory",
          pattern: "/home/other/project",
          sessionID: "s1",
          messageID: "m1",
          title: "external dir",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        output,
      ).pipe(Effect.provide(WorkspaceLayer)),
    )

    expect(output.status).not.toBe("allow")
  })

  it("different repoRoot values produce different results for same path", async () => {
    // /home/user/project/src/app.ts is inside /home/user/project
    // but outside /workspace
    const outputOutside = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "perm-diff-1",
          type: "edit",
          pattern: "/home/user/project/src/app.ts",
          sessionID: "s1",
          messageID: "m1",
          title: "edit",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        outputOutside,
      ).pipe(Effect.provide(WorkspaceLayer)),
    )
    // Outside /workspace → not allowed
    expect(outputOutside.status).not.toBe("allow")

    // Now with the correct repo root
    const OutputInsideLayer = Layer.mergeAll(
      ReviewerLive,
      ApprovalLive,
      ReviewedStateLive,
      Layer.succeed(RepoConfig, { repoRoot: "/home/user/project" }),
    )

    const outputInside = { status: "ask" as "allow" | "deny" | "ask" }

    await Effect.runPromise(
      handlePermissionAsk(
        {
          id: "perm-diff-2",
          type: "edit",
          pattern: "/home/user/project/src/app.ts",
          sessionID: "s1",
          messageID: "m1",
          title: "edit",
          metadata: {},
          time: { created: Date.now() },
        } as never,
        outputInside,
      ).pipe(Effect.provide(OutputInsideLayer)),
    )
    // Inside /home/user/project → allowed
    expect(outputInside.status).toBe("allow")
  })
})
