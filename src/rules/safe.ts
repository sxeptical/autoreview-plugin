import type { DecisionType } from "../domain/ReviewDecision.js"

type RiskRule = {
  pattern: RegExp
  decision: DecisionType
  reason: string
}

const SAFE_PATTERNS: RiskRule[] = [
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname)\s/, decision: "approve", reason: "read-only/display command" },
  { pattern: /^node\s+(-v|--version)(\s|$)/, decision: "approve", reason: "node version check" },
  { pattern: /^(npm|yarn|pnpm|bun)\s+(list|ls|view|info|why|outdated|doctor)(\s|$)/, decision: "approve", reason: "package metadata/read-only command" },
  { pattern: /^(npm|yarn|pnpm|bun)\s+run\s+(type|typecheck|lint|test|build|dev|start)(\s|$)/, decision: "approve", reason: "common package script execution" },
  { pattern: /^git\s+status\s*$/, decision: "approve", reason: "git status is safe" },
  { pattern: /^git\s+diff\s*/, decision: "approve", reason: "git diff is read-only" },
  { pattern: /^git\s+log\s*/, decision: "approve", reason: "git log is read-only" },
  { pattern: /^git\s+branch\s*/, decision: "approve", reason: "git branch listing is safe" },
  { pattern: /^git\s+stash\s*/, decision: "approve", reason: "git stash is safe" },
  { pattern: /^(type|typecheck|lint|test|build|dev|start)\s*$/, decision: "approve", reason: "common dev script" },
  { pattern: /^(mkdir|touch)\s/, decision: "approve", reason: "simple file/dir creation" },
  { pattern: /^(python|python3|node)\s+-c\s/, decision: "approve", reason: "inline script execution" },
]

export function matchSafePattern(command: string): { decision: DecisionType; reason: string } | null {
  for (const rule of SAFE_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason }
    }
  }
  return null
}
