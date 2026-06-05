import { Effect, Layer, ManagedRuntime } from "effect"
import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { ReviewerLive } from "./services/Reviewer.js"
import { ApprovalLive } from "./services/Approval.js"
import { ReviewedStateLive } from "./services/ReviewedState.js"
import {
  handlePermissionAsk,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
} from "./plugin/hooks.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "./domain/Errors.js"

const AppLayer = Layer.mergeAll(ReviewerLive, ApprovalLive, ReviewedStateLive)
const runtime = ManagedRuntime.make(AppLayer)

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    "permission.ask": (permission, output) => {
      return runtime.runPromise(handlePermissionAsk(permission, output))
    },

    "tool.execute.before": (input, output) => {
      return runtime.runPromise(
        handleToolExecuteBefore(input, output).pipe(
          Effect.catchAll((error) => {
            if (error instanceof BlockedCommandError) {
              throw new Error(`auto-review blocked command: ${error.reason}`)
            }
            if (error instanceof BlockedEditError) {
              throw new Error(`auto-review blocked edit: ${error.reason}`)
            }
            if (error instanceof RequiresHumanApprovalError) {
              throw new Error(`auto-review requires manual approval: ${error.reason}`)
            }
            throw error
          })
        )
      )
    },

    "tool.execute.after": (input, output) => {
      return runtime.runPromise(handleToolExecuteAfter(input, output))
    },
  } satisfies Hooks
}
