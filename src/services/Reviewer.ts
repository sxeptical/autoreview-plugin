import * as path from "node:path"
import { Context, Effect, Layer } from "effect"
import { ActionContext } from "../domain/ActionContext.js"
import { ReviewDecision } from "../domain/ReviewDecision.js"
import { matchDangerousPattern } from "../rules/dangerous.js"
import { matchSafePattern } from "../rules/safe.js"
import { matchShellExpansionPattern } from "../rules/shell-expansion.js"

const EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md"]

/**
 * Sensitive path prefixes that require human review when edited.
 *
 * Each entry is either:
 *   - an absolute root (e.g. "/etc/") — matched with path‑boundary awareness
 *   - a relative/project pattern (e.g. "package.json", ".git/config") — matched with includes()
 *
 * On macOS `/var` is a symlink to `/private/var`; we handle this by resolving
 * real paths before comparison (see `isAbsoluteSystemPath`).
 */
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

/**
 * System roots that should be compared against the resolved (real) path of
 * an absolute input.  Includes both the nominal path and the macOS `/private`
 * counterpart so that `/var/log` → `/private/var/log` is still detected.
 * The trailing slash ensures we don't false-positive on e.g. `/etcetera/`
 * when checking for `/etc/`.
 */
const ABSOLUTE_SYSTEM_ROOTS = [
  "/etc/", "/usr/", "/var/", "/boot/",
  // macOS: /var → /private/var, /tmp → /private/tmp, etc.
  "/private/etc/", "/private/var/", "/private/boot/",
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
    readonly reviewEdit: (path: string, args?: Record<string, unknown>, repoRoot?: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewExternalDirectory: (path: string, repoRoot?: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewAction: (context: ActionContext, repoRoot?: string) => Effect.Effect<ReviewDecision, never>
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

/**
 * Resolve a path string to its real filesystem path, following symlinks.
 * Falls back to the original path if `fs.realpathSync` throws (e.g. the
 * file doesn't exist yet).
 */
function safeRealpath(p: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").realpathSync(p) as string
  } catch {
    return p
  }
}

/**
 * Determine whether an absolute path points into a sensitive system
 * directory, using resolved (real) paths so macOS `/var → /private/var`
 * symlinks don't cause false-positives.
 *
 * For example, `/private/var/folders/...` is NOT sensitive, but
 * `/var/log/` IS.
 */
function isSystemSensitivePath(absolutePath: string): boolean {
  // Check both the original and the resolved (real) path so that
  // legitimate `/var/folders/...` (which resolves under `/private/var`)
  // is correctly excluded.
  const candidates = [absolutePath]
  try {
    candidates.push(require("node:fs").realpathSync(absolutePath) as string)
  } catch {
    // If realpath fails (path doesn't exist), just use the original
  }

  for (const candidate of candidates) {
    for (const root of ABSOLUTE_SYSTEM_ROOTS) {
      if (candidate.startsWith(root) && !candidate.includes("/var/folders")) {
        return true
      }
    }
  }
  return false
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

  // ── path-escape check (on absolute/resolved path) ──────────────────
  // Resolve the raw input to an absolute path first so that symlink
  // escapes and `..` traversal are caught even after normalization.
  const resolved = path.isAbsolute(rawPath)
    ? safeRealpath(rawPath)
    : repoRoot
      ? path.resolve(repoRoot, rawPath)
      : path.resolve(rawPath)

  if (repoRoot) {
    const realRepoRoot = safeRealpath(repoRoot)
    if (!resolved.startsWith(realRepoRoot)) {
      return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
    }
  } else {
    // Without a repo root, reject absolute paths that walk up via ..
    const relFromRoot = path.relative("/", resolved)
    if (relFromRoot.split(path.sep).includes("..")) {
      return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
    }
  }

  // ── absolute system-root check (boundary-aware) ────────────────────
  if (path.isAbsolute(rawPath)) {
    const real = path.isAbsolute(rawPath) ? resolved : rawPath
    if (isSystemSensitivePath(real)) {
      return new ReviewDecision({ decision: "require_human", reason: "editing sensitive system path" })
    }
  }

  // ── project-relative sensitive paths ────────────────────────────────
  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    // Skip absolute system roots — they're handled above.
    if (sensitive.startsWith("/")) continue
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

/**
 * Temp/cache directories that are always safe for external-directory access.
 * Accepts absolute paths (with leading `/`) and handles macOS symlink
 * resolution (`/tmp` → `/private/tmp`, `/var` → `/private/var`).
 */
function isTempOrCachePath(absolutePath: string): boolean {
  // Fast prefix checks for common temp patterns (both symlinked and real)
  if (absolutePath.startsWith("/tmp") || absolutePath.startsWith("/private/tmp")) {
    return true
  }
  // macOS stores temp/cache under /var/folders → /private/var/folders
  if (absolutePath.startsWith("/var/folders") || absolutePath.startsWith("/private/var/folders")) {
    return true
  }
  // General cache directory
  if (absolutePath.includes("/.cache/")) {
    return true
  }
  return false
}

function reviewExternalDirectoryAction(rawPath: string, repoRoot?: string): ReviewDecision {
  const normalized = normalizeEditPath(rawPath, repoRoot)

  // ── temp/cache check (on absolute path, not normalized) ─────────────
  // normalizeEditPath strips the leading slash, so we must check the
  // raw (or resolved-absolute) path for temp/cache patterns.
  const absolutePath = path.isAbsolute(rawPath)
    ? safeRealpath(rawPath)
    : repoRoot
      ? path.resolve(repoRoot, rawPath)
      : path.resolve(rawPath)

  if (isTempOrCachePath(absolutePath)) {
    return new ReviewDecision({ decision: "approve", reason: "temp/cache directory access" })
  }

  // ── path-escape check ──────────────────────────────────────────────
  if (repoRoot) {
    const realRepoRoot = safeRealpath(repoRoot)
    if (!absolutePath.startsWith(realRepoRoot)) {
      return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
    }
  } else {
    const relFromRoot = path.relative("/", absolutePath)
    if (relFromRoot.split(path.sep).includes("..")) {
      return new ReviewDecision({ decision: "require_human", reason: "path escapes repo root" })
    }
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
    reviewEdit: (path: string, args?: Record<string, unknown>, repoRoot?: string) => Effect.sync(() => reviewEditAction(path, args, repoRoot)),
    reviewExternalDirectory: (path: string, repoRoot?: string) => Effect.sync(() => reviewExternalDirectoryAction(path, repoRoot)),
    reviewAction: (context: ActionContext, repoRoot?: string) => Effect.sync(() => reviewActionContext(context, repoRoot)),
  }
)
