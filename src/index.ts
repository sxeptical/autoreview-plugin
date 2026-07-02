import { Cause, Effect, Layer, ManagedRuntime, Option } from "effect"
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

/** Symbol under which Effect stores the underlying Cause on a FiberFailure. */
const FIBER_FAILURE_CAUSE = Symbol.for("effect/Runtime/FiberFailure/Cause")

/**
 * Known auto-review error tags mapped to their user-facing prefixes.
 * The `_tag` values are produced by Effect's `Data.TaggedError` helper
 * in `src/domain/Errors.ts`.
 */
const HOOK_ERROR_PREFIX: Record<string, string> = {
  BlockedCommandError: "auto-review blocked command: ",
  BlockedEditError: "auto-review blocked edit: ",
  RequiresHumanApprovalError: "auto-review requires manual approval: ",
}

/**
 * Resolves the error to a plain JS error for the OpenCode runtime to surface.
 *
 * Effect's `ManagedRuntime.runPromise()` wraps failures in a `FiberFailure`
 * whose prototype chain does **not** include the original error.  We unwrap
 * the underlying Cause via the well-known Symbol, extract the first failure,
 * and map known `_tag`s to human-readable messages.
 */
/** @internal Exported for testing only. */
export function resolveHookError(error: unknown): never {
  // Fast path: direct instanceof check covers the rare case where
  // the error is *not* wrapped (e.g. in tests that call hooks directly
  // via Effect.runPromise).
  for (const [tag, prefix] of Object.entries(HOOK_ERROR_PREFIX)) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as Record<string, unknown>)._tag === tag
    ) {
      throw new Error(`${prefix}${(error as { reason: string }).reason}`)
    }
  }

  // Slow path: unwrap a FiberFailure-wrapped Effect cause.
  if (typeof error === "object" && error !== null) {
    const cause = (error as Record<symbol, unknown>)[FIBER_FAILURE_CAUSE]
    if (cause && typeof cause === "object") {
      const failureOpt = Cause.failureOption(cause as never)
      if (Option.isSome(failureOpt)) {
        const inner = failureOpt.value as Record<string, unknown>
        const tag = inner._tag as string | undefined
        if (tag && tag in HOOK_ERROR_PREFIX) {
          throw new Error(`${HOOK_ERROR_PREFIX[tag]}${(inner as { reason: string }).reason}`)
        }
      }
    }
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
