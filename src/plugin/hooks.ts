import { Effect } from "effect"
import type { Permission } from "@opencode-ai/sdk"
import { Reviewer } from "../services/Reviewer.js"
import { Approval } from "../services/Approval.js"
import { ReviewedState } from "../services/ReviewedState.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "../domain/Errors.js"

type ApprovalOutput = {
  status: "allow" | "deny" | "ask"
}

type ToolInput = {
  tool: string
  callID: string
}

type ToolOutput = {
  args?: Record<string, unknown>
  output?: unknown
  title?: string
}

const permissionCallID = (permission: { id: string; callID?: string }) => permission.callID ?? permission.id

export function handlePermissionAsk(
  permission: Permission,
  output: ApprovalOutput
): Effect.Effect<void, never, Reviewer | Approval | ReviewedState> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const approval = yield* Approval
    const state = yield* ReviewedState

    if (permission.type === "edit" || permission.type === "external_directory") {
      const context = permission.type === "edit"
        ? yield* reviewer.reviewEdit(String(permission.pattern ?? ""), {})
        : yield* reviewer.reviewExternalDirectory(String(permission.pattern ?? ""))
      
      yield* state.trackDecision(permissionCallID(permission), context.decision)
      const status = yield* approval.applyDecision(context)
      output.status = status
      return
    }

    if (permission.type === "bash") {
      const cmd = typeof permission.pattern === "string"
        ? permission.pattern
        : Array.isArray(permission.pattern)
          ? permission.pattern[0]
          : undefined

      if (cmd && cmd !== "*") {
        const decision = yield* reviewer.reviewBash(cmd)
        yield* state.trackDecision(permissionCallID(permission), decision.decision)
        const status = yield* approval.applyDecision(decision)
        output.status = status
        return
      }

      yield* state.trackDecision(permissionCallID(permission), "require_human")
      output.status = "ask"
    }
  })
}

export function handleToolExecuteBefore(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, BlockedCommandError | BlockedEditError | RequiresHumanApprovalError, Reviewer | ReviewedState> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const state = yield* ReviewedState

    if (input.tool === "bash" && output.args?.command) {
      const cmd = String(output.args.command)
      const decision = yield* reviewer.reviewBash(cmd)
      const preReviewedDecision = yield* state.getDecision(input.callID)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedCommandError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }

      yield* state.track(input.callID)
      return
    }

    if (input.tool === "edit" && output.args?.filePath) {
      const decision = yield* reviewer.reviewEdit(String(output.args.filePath), output.args)
      const preReviewedDecision = yield* state.getDecision(input.callID)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedEditError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }
    }
  })
}

export function handleToolExecuteAfter(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, never, ReviewedState> {
  return Effect.gen(function* () {
    const state = yield* ReviewedState

    yield* state.clearDecision(input.callID)
    const isReviewed = yield* state.isReviewed(input.callID)
    
    if (!isReviewed) return
    
    yield* state.clear(input.callID)

    if (input.tool === "bash" || input.tool === "edit") {
      const outputText = String(output.output || "")
      if (outputText === "") {
        output.title = input.tool === "bash" ? "auto-review: command blocked" : "auto-review: edit blocked"
      }
    }
  })
}
