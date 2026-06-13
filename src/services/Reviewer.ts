import * as path from "node:path"
import { Context, Effect, Layer } from "effect"
import { ActionContext } from "../domain/ActionContext.js"
import { ReviewDecision } from "../domain/ReviewDecision.js"
import { matchDangerousPattern } from "../rules/dangerous.js"
import { matchSafePattern } from "../rules/safe.js"
import { matchShellExpansionPattern } from "../rules/shell-expansion.js"

const EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md"]

const EDIT_SENSITIVE_PATHS = [
  "/etc/", "/usr/", "/var/", "/boot/", "~/.ssh/", "~/.gnupg/",
  ".env", "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".git/config", ".git/hooks/",
  ".github/workflows/", ".gitlab-ci.yml", ".circleci/",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".npmrc", ".yarnrc", ".pnpmrc",
  ".aws/", ".kube/config",
  "tsconfig.json", "tsconfig.base.json",
  "next.config.js", "vite.config.ts", "vite.config.js", "webpack.config.js",
  ".eslintrc", ".prettierrc",
]

const EDIT_SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /(^|\/)auth\.[a-z]+$/i,
  /(^|\/)auth[_-]/i,
  /(^|\/)login[_-]?[a-z]*\.[a-z]+$/i,
  /(^|\/)permission[s]?\.[a-z]+$/i,
  /(^|\/)security[_-]/i,
  /(^|\/)secret[s]?\.[a-z]+$/i,
  /(^|\/)credential[s]?\.[a-z]+$/i,
  /(^|\/)token[s]?\.[a-z]+$/i,
  /(^|\/)api[_-]?key/i,
  /(^|\/)certificate[s]?/i,
]

export class Reviewer extends Context.Tag("Reviewer")<
  Reviewer,
  {
    readonly reviewBash: (command: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.Effect<ReviewDecision, never>
    readonly reviewExternalDirectory: (path: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewAction: (context: ActionContext) => Effect.Effect<ReviewDecision, never>
  }
>() {}

const firstPattern = (pattern: unknown): string | undefined =>
  typeof pattern === "string"
    ? pattern
    : Array.isArray(pattern)
      ? pattern[0]
      : undefined

const expandHome = (p: string): string => {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME || "", p.slice(2))
  }
  return p
}

export function normalizeEditPath(input: string, repoRoot?: string): string {
  const trimmed = input.trim()
  const expanded = expandHome(trimmed)
  const absolute = path.isAbsolute(expanded) ? expanded : (repoRoot ? path.resolve(repoRoot, expanded) : path.resolve(expanded))
  const real = path.relative(repoRoot || "/", absolute).split(path.sep).join("/")
  return real.replace(/^\.\//, "")
}

function reviewBashCommand(command: string): ReviewDecision {
  const dangerousMatch = matchDangerousPattern(command)
  if (dangerousMatch) {
    return new ReviewDecision(dangerousMatch)
  }

  const expansionMatch = matchShellExpansionPattern(command)
  if (expansionMatch) {
    return new ReviewDecision(expansionMatch)
  }

  const safeMatch = matchSafePattern(command)
  if (safeMatch) {
    return new ReviewDecision(safeMatch)
  }

  return new ReviewDecision({ decision: "require_human", reason: "command is not allowlisted by auto-review" })
}

function reviewEditAction(rawPath: string, args?: Record<string, unknown>, repoRoot?: string): ReviewDecision {
  const normalized = normalizeEditPath(rawPath, repoRoot)

  if (normalized.split("/").includes("..") || path.isAbsolute(rawPath) && !rawPath.startsWith(repoRoot || "")) {
    return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
  }

  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    if (normalized.includes(sensitive)) {
      return new ReviewDecision({ decision: "require_human", reason: `editing sensitive path: ${sensitive}` })
    }
  }

  for (const pattern of EDIT_SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return new ReviewDecision({ decision: "require_human", reason: `editing security-related file: ${path.basename(normalized)}` })
    }
  }

  if (!normalized.includes(".")) {
    return new ReviewDecision({ decision: "require_human", reason: "editing file with no extension" })
  }

  const ext = normalized.substring(normalized.lastIndexOf("."))
  if (!EDIT_SAFE_EXTENSIONS.includes(ext)) {
    return new ReviewDecision({ decision: "require_human", reason: `editing file with disallowed extension: ${ext}` })
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

  return new ReviewDecision({ decision: "approve", reason: "edit passed all risk checks" })
}

function reviewExternalDirectoryAction(rawPath: string, repoRoot?: string): ReviewDecision {
  const normalized = normalizeEditPath(rawPath, repoRoot)

  if (normalized.startsWith("/tmp") || normalized.startsWith("/var/folders") || normalized.includes("/.cache/")) {
    return new ReviewDecision({ decision: "approve", reason: "temp/cache directory access" })
  }

  if (normalized.split("/").includes("..") || path.isAbsolute(rawPath) && !rawPath.startsWith(repoRoot || "")) {
    return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
  }

  return new ReviewDecision({ decision: "require_human", reason: `external directory outside temp/cache: ${normalized}` })
}

function reviewActionContext(context: ActionContext, repoRoot?: string): ReviewDecision {
  const { permission, command, args } = context

  if (permission.type === "bash" && command) {
    return reviewBashCommand(command)
  }

  if (permission.type === "edit") {
    const p = firstPattern(permission.pattern)
    if (!p) {
      return new ReviewDecision({ decision: "approve", reason: "no specific path to review" })
    }
    return reviewEditAction(p, args, repoRoot)
  }

  if (permission.type === "external_directory") {
    const p = firstPattern(permission.pattern)
    if (!p) {
      return new ReviewDecision({ decision: "approve", reason: "no specific path to review" })
    }
    return reviewExternalDirectoryAction(p, repoRoot)
  }

  return new ReviewDecision({ decision: "require_human", reason: "action type is not handled by auto-review" })
}

export const ReviewerLive = Layer.succeed(
  Reviewer,
  {
    reviewBash: (command: string) => Effect.sync(() => reviewBashCommand(command)),
    reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.sync(() => reviewEditAction(path, args)),
    reviewExternalDirectory: (path: string) => Effect.sync(() => reviewExternalDirectoryAction(path)),
    reviewAction: (context: ActionContext) => Effect.sync(() => reviewActionContext(context)),
  }
)
