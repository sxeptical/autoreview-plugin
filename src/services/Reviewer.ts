import { Context, Effect, Layer } from "effect"
import { ReviewDecision } from "../domain/ReviewDecision.js"
import { matchDangerousPattern } from "../rules/dangerous.js"
import { matchSafePattern } from "../rules/safe.js"

const EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".jsonc", ".md", ".css", ".html", ".yaml", ".yml", ".toml", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp"]

const EDIT_SENSITIVE_PATHS = ["/etc/", "/usr/", "/var/", "/boot/", "~/.ssh/", "~/.gnupg/", ".env", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".git/config"]

export class Reviewer extends Context.Tag("Reviewer")<
  Reviewer,
  {
    readonly reviewBash: (command: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.Effect<ReviewDecision, never>
    readonly reviewExternalDirectory: (path: string) => Effect.Effect<ReviewDecision, never>
  }
>() {}

function reviewBashCommand(command: string): ReviewDecision {
  const dangerousMatch = matchDangerousPattern(command)
  if (dangerousMatch) {
    return new ReviewDecision(dangerousMatch)
  }

  if (command.includes("|") || command.includes("&&") || command.includes(";")) {
    return new ReviewDecision({ decision: "require_human", reason: "compound command with pipes or chains" })
  }

  const safeMatch = matchSafePattern(command)
  if (safeMatch) {
    return new ReviewDecision(safeMatch)
  }

  return new ReviewDecision({ decision: "require_human", reason: "command is not allowlisted by auto-review" })
}

function reviewEditAction(path: string, args?: Record<string, unknown>): ReviewDecision {
  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    if (path.includes(sensitive)) {
      return new ReviewDecision({ decision: "require_human", reason: `editing sensitive path: ${sensitive}` })
    }
  }

  const ext = path.substring(path.lastIndexOf("."))
  if (!EDIT_SAFE_EXTENSIONS.includes(ext)) {
    return new ReviewDecision({ decision: "require_human", reason: `editing file with unusual extension: ${ext}` })
  }

  if (args && typeof args.oldString === "string" && typeof args.newString === "string") {
    const oldLen = args.oldString.trim().length
    const newLen = args.newString.trim().length

    if (oldLen > 0 && newLen === 0) {
      return new ReviewDecision({ decision: "require_human", reason: "edit clears an existing code/content block" })
    }

    if (oldLen >= 300 && newLen < oldLen * 0.2) {
      return new ReviewDecision({ decision: "require_human", reason: "edit appears to remove most of a large content block" })
    }
  }

  return new ReviewDecision({ decision: "approve", reason: "edit is safe" })
}

function reviewExternalDirectoryAction(path: string): ReviewDecision {
  if (path.startsWith("/tmp") || path.startsWith("/var/folders") || path.includes("/.cache/")) {
    return new ReviewDecision({ decision: "approve", reason: "temp/cache directory access" })
  }

  return new ReviewDecision({ decision: "require_human", reason: `external directory outside temp/cache: ${path}` })
}

export const ReviewerLive = Layer.succeed(
  Reviewer,
  {
    reviewBash: (command: string) => Effect.sync(() => reviewBashCommand(command)),
    reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.sync(() => reviewEditAction(path, args)),
    reviewExternalDirectory: (path: string) => Effect.sync(() => reviewExternalDirectoryAction(path)),
  }
)
