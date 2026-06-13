import type { DecisionType } from "../domain/ReviewDecision.js"

type RiskRule = {
  pattern: RegExp
  decision: DecisionType
  reason: string
}

const SHELL_EXPANSION_PATTERNS: RiskRule[] = [
  { pattern: /\$\(/, decision: "require_human", reason: "command substitution via $() hides execution" },
  { pattern: /`/, decision: "require_human", reason: "command substitution via backticks hides execution" },
  { pattern: /\|\|/, decision: "require_human", reason: "logical OR chain can mask fallback execution" },
  { pattern: /\n/, decision: "require_human", reason: "embedded newline can chain commands" },
  { pattern: /\s2>&1\s*\|/, decision: "require_human", reason: "redirection into pipe can mask execution" },
  { pattern: /<\(/, decision: "require_human", reason: "process substitution hides execution" },
  { pattern: /\bsh\s+-c\b/, decision: "require_human", reason: "sh -c executes arbitrary string as shell" },
  { pattern: /\bbash\s+-c\b/, decision: "require_human", reason: "bash -c executes arbitrary string as shell" },
  { pattern: /\bzsh\s+-c\b/, decision: "require_human", reason: "zsh -c executes arbitrary string as shell" },
  { pattern: /\beval\s+/, decision: "require_human", reason: "eval executes constructed string" },
  { pattern: /\bexec\s+/, decision: "require_human", reason: "exec replaces shell with new process" },
  { pattern: /\bsource\s+/, decision: "require_human", reason: "source executes file in current shell" },
]

export function matchShellExpansionPattern(command: string): { decision: DecisionType; reason: string } | null {
  for (const rule of SHELL_EXPANSION_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason }
    }
  }
  return null
}
