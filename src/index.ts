import { Effect, Layer, ManagedRuntime } from "effect"
import type { Plugin, PluginModule, Hooks } from "@opencode-ai/plugin"
import { ReviewerLive } from "./services/Reviewer.js"
import { ApprovalLive } from "./services/Approval.js"
import { ReviewedStateLive } from "./services/ReviewedState.js"
import { RepoConfig } from "./domain/RepoConfig.js"
import {
  handlePermissionAsk,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
} from "./plugin/hooks.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "./domain/Errors.js"

/** Resolves the error to a plain JS error for the OpenCode runtime to surface. */
function resolveHookError(error: unknown): never {
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
}

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  // Prefer the VCS worktree; fall back to the project directory.
  const repoRoot = worktree || directory

  // Each plugin invocation gets its own runtime so that the repo root
  // config (and therefore path-relative resolution) is correctly scoped
  // to the workspace that loaded the plugin.
  const appLayer = Layer.mergeAll(
    ReviewerLive,
    ApprovalLive,
    ReviewedStateLive,
    Layer.succeed(RepoConfig, { repoRoot }),
  )
  const runtime = ManagedRuntime.make(appLayer)

  return {
    "permission.ask": (permission, output) => {
      return runtime.runPromise(
        handlePermissionAsk(permission, output)
      ) as Promise<void>
    },

    "tool.execute.before": (input, output) => {
      return runtime.runPromise(
        handleToolExecuteBefore(input, output)
      ).catch(resolveHookError) as Promise<void>
    },

    "tool.execute.after": (input, output) => {
      return runtime.runPromise(
        handleToolExecuteAfter(input, output)
      ) as Promise<void>
    },
  } satisfies Hooks
}

/**
 * OpenCode-compatible module export. OpenCode discovers plugins by looking for
 * a `server` export (the `PluginModule` shape).  The named `AutoReviewPlugin`
 * export is kept for backwards compatibility.
 */
export const server: PluginModule["server"] = AutoReviewPlugin

export default AutoReviewPlugin
