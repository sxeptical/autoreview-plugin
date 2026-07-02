import { Effect } from "effect"
import type { Permission } from "@opencode-ai/sdk"
import { Reviewer } from "../services/Reviewer.js"
import { Approval } from "../services/Approval.js"
import { ReviewedState } from "../services/ReviewedState.js"
import { RepoConfig } from "../domain/RepoConfig.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "../domain/Errors.js"
import { ActionContext } from "../domain/ActionContext.js"

type ApprovalOutput = {
  status: "allow" | "deny" | "ask"
}

type ToolInput = {
  tool: string
  callID: string
  sessionID?: string
}

type ToolOutput = {
  args?: Record<string, unknown>
  output?: unknown
  title?: string
}

/**
 * Derive a stable tracking key from a permission object.
 * OpenCode may supply `callID` on some hooks and only `id` on others;
 * using the preferred `callID ?? id` keeps both paths aligned.
 */
export const trackingKey = (permission: { id: string; callID?: string }) =>
  permission.callID ?? permission.id

/**
 * Normalise the callID used by the tool.execute.before/after hooks so
 * that the permission.ask → tool.execute flow uses consistent keys even
 * when OpenCode supplies a different callID format.
 */
const toolCallKey = (input: { callID: string; sessionID?: string }) =>
  input.callID

const firstPattern = (pattern: unknown): string | undefined =>
  typeof pattern === "string"
    ? pattern
    : Array.isArray(pattern)
      ? pattern[0]
      : undefined

export function handlePermissionAsk(
  permission: Permission,
  output: ApprovalOutput
): Effect.Effect<void, never, Reviewer | Approval | ReviewedState | RepoConfig> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const approval = yield* Approval
    const state = yield* ReviewedState
    const { repoRoot } = yield* RepoConfig

    if (permission.type === "edit" || permission.type === "external_directory") {
      const context = yield* reviewer.reviewAction(
        new ActionContext({
          permission: permission as never,
          toolName: permission.type,
        }),
        repoRoot,
      )
      
      yield* state.trackDecision(trackingKey(permission), context.decision)
      const status = yield* approval.applyDecision(context)
      output.status = status
      return
    }

    if (permission.type === "bash") {
      const cmd = firstPattern(permission.pattern)

      if (cmd && cmd !== "*") {
        const decision = yield* reviewer.reviewAction(
          new ActionContext({
            permission: permission as never,
            toolName: "bash",
            command: cmd,
          }),
          repoRoot,
        )
        yield* state.trackDecision(trackingKey(permission), decision.decision)
        const status = yield* approval.applyDecision(decision)
        output.status = status
        return
      }

      yield* state.trackDecision(trackingKey(permission), "require_human")
      output.status = "ask"
    }
  })
}

export function handleToolExecuteBefore(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, BlockedCommandError | BlockedEditError | RequiresHumanApprovalError, Reviewer | ReviewedState | RepoConfig> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const state = yield* ReviewedState
    const { repoRoot } = yield* RepoConfig

    const key = toolCallKey(input)

    // ── bash ───────────────────────────────────────────────────────────
    if (input.tool === "bash" && output.args?.command) {
      const cmd = String(output.args.command)
      const decision = yield* reviewer.reviewBash(cmd)
      const preReviewedDecision = yield* state.getDecision(key)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedCommandError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }

      yield* state.track(key)
      return
    }

    // ── edit ───────────────────────────────────────────────────────────
    if (input.tool === "edit" && output.args?.filePath) {
      const decision = yield* reviewer.reviewEdit(String(output.args.filePath), output.args, repoRoot)
      const preReviewedDecision = yield* state.getDecision(key)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedEditError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }

      yield* state.track(key)
      return
    }

    // ── write (new file creation) ──────────────────────────────────────
    // The OpenCode `write` tool creates or overwrites an entire file.
    // Its args expose `filePath` (or `path`) and `content`.
    if (input.tool === "write") {
      const filePath = String(output.args?.filePath ?? output.args?.path ?? "")
      if (!filePath) return

      const decision = yield* reviewer.reviewEdit(filePath, output.args, repoRoot)
      const preReviewedDecision = yield* state.getDecision(key)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedEditError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }

      yield* state.track(key)
    }
  })
}

export function handleToolExecuteAfter(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, never, ReviewedState> {
  return Effect.gen(function* () {
    const state = yield* ReviewedState
    const key = toolCallKey(input)

    yield* state.clearDecision(key)
    const isReviewed = yield* state.isReviewed(key)
    
    if (!isReviewed) return
    
    yield* state.clear(key)

    if (input.tool === "bash" || input.tool === "edit" || input.tool === "write") {
      const outputText = String(output.output || "")
      if (outputText === "") {
        output.title =
          input.tool === "bash"
            ? "auto-review: command blocked"
            : input.tool === "write"
              ? "auto-review: write blocked"
              : "auto-review: edit blocked"
      }
    }
  })
}
