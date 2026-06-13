import type { DecisionType } from "../domain/ReviewDecision.js"

type RiskRule = {
  pattern: RegExp
  decision: DecisionType
  reason: string
}

const SAFE_PATTERNS: RiskRule[] = [
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname|env|true|false)(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "bare read-only/display command with optional flags" },
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname)\s+--?[a-zA-Z0-9-]+(\s+[^|&;<>`$\n]+)*\s*$/, decision: "approve", reason: "read-only/display command with flags and args" },
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname)\s+[^|&;<>`$\n-][^|&;<>`$\n]*$/, decision: "approve", reason: "read-only/display command with non-flag args" },
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname)\s*$/, decision: "approve", reason: "bare read-only/display command" },
  { pattern: /^node\s+(-v|--version)(\s|$)/, decision: "approve", reason: "node version check" },
  { pattern: /^(npm|yarn|pnpm|bun)\s+(list|ls|view|info|why|outdated|doctor)(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "package metadata/read-only command" },
  { pattern: /^(npm|yarn|pnpm|bun)\s+run\s+(type|typecheck|test|lint|build|check|format)(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "read-mostly package script" },
  { pattern: /^git\s+status\s*$/, decision: "approve", reason: "git status is safe" },
  { pattern: /^git\s+diff(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "git diff is read-only" },
  { pattern: /^git\s+log(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "git log is read-only" },
  { pattern: /^git\s+branch(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "git branch listing is safe" },
  { pattern: /^git\s+show(\s+--?[a-zA-Z0-9-]+)*\s*$/, decision: "approve", reason: "git show is read-only" },
  { pattern: /^(type|typecheck|lint|test|check|format)\s*$/, decision: "approve", reason: "common dev script" },
  { pattern: /^(mkdir|touch)(\s+--?[a-zA-Z0-9-]+)*\s+[^|&;<>`$\n]+$/, decision: "approve", reason: "simple file/dir creation with flags" },
  { pattern: /^(cp|mv)(\s+--?[a-zA-Z0-9-]+)*\s+[^|&;<>`$\n]+(\s+[^|&;<>`$\n]+)+\s*$/, decision: "approve", reason: "simple local file copy/move" },
]

export function matchSafePattern(command: string): { decision: DecisionType; reason: string } | null {
  for (const rule of SAFE_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason }
    }
  }
  return null
}
