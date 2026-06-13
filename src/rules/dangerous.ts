import type { DecisionType } from "../domain/ReviewDecision.js"

type RiskRule = {
  pattern: RegExp
  decision: DecisionType
  reason: string
}

const DANGEROUS_PATTERNS: RiskRule[] = [
  { pattern: /rm\s+(-[rfivd]+\s+)*["']?(~|\$HOME|\$USER|\/|\/etc|\/usr|\/var|\/home|\*)["']?/, decision: "deny", reason: "destructive recursive deletion on critical paths" },
  { pattern: /rm\s+(-[rfivd]+\s+)*\$\{?(HOME|USER)\}?/, decision: "deny", reason: "rm against $HOME/$USER" },
  { pattern: /sudo\s+/, decision: "require_human", reason: "privilege escalation via sudo" },
  { pattern: /chmod\s+777/, decision: "deny", reason: "world-writable permissions (777) are unsafe" },
  { pattern: /chown\s+(-R\s+)?[^:\s]+:[^:\s]+\s+\//, decision: "require_human", reason: "chown on root-level paths" },
  { pattern: />\s*\/etc\//, decision: "deny", reason: "writing to /etc system config directory" },
  { pattern: /mkfs\./, decision: "deny", reason: "filesystem formatting command" },
  { pattern: /dd\s+if=/, decision: "deny", reason: "low-level disk operations via dd" },
  { pattern: /:\(\)\s*\{/, decision: "deny", reason: "fork bomb pattern detected" },
  { pattern: /curl.*\|\s*(ba)?sh/, decision: "deny", reason: "piping remote content directly to shell" },
  { pattern: /wget.*\|\s*(ba)?sh/, decision: "deny", reason: "piping remote content directly to shell" },
  { pattern: />\s*\/dev\/sd[a-z]/, decision: "deny", reason: "writing directly to block device" },
  { pattern: /git\s+push\s+.*--force.*main/, decision: "require_human", reason: "force pushing to main branch" },
  { pattern: /git\s+push\s+.*--force.*master/, decision: "require_human", reason: "force pushing to master branch" },
  { pattern: /git\s+reset\s+--hard/, decision: "require_human", reason: "hard reset discards working tree changes" },
  { pattern: /git\s+clean\s+-[fdx]+/, decision: "require_human", reason: "git clean removes untracked files" },
  { pattern: /git\s+stash\s+(drop|clear|pop)/, decision: "require_human", reason: "git stash drop/clear/pop discards stashed work" },
  { pattern: />\s*~\/.ssh\//, decision: "deny", reason: "writing to SSH config directory" },
  { pattern: /\.env(\.\w+)?$/, decision: "require_human", reason: "modifying environment variable file" },
  { pattern: /npm\s+(publish|unpublish|deprecate)/, decision: "require_human", reason: "npm publish/unpublish/deprecate affects registry" },
  { pattern: /\b(rm|del|format|drop|truncate)\b.*\b(database|table|schema)\b/i, decision: "deny", reason: "database destructive operation" },
]

export function matchDangerousPattern(command: string): { decision: DecisionType; reason: string } | null {
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason }
    }
  }
  return null
}
