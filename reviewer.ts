import type { Permission } from "@opencode-ai/sdk";

export type ReviewDecision = {
  decision: "approve" | "deny" | "require_human";
  reason: string;
};

export type ActionContext = {
  permission: Permission;
  toolName: string;
  command?: string;
  args?: Record<string, unknown>;
};

type RiskRule = {
  pattern: RegExp;
  decision: ReviewDecision["decision"];
  reason: string;
};

const DANGEROUS_PATTERNS: RiskRule[] = [
  { pattern: /rm\s+(-[rf]+\s+)*(\/|\/etc|\/usr|\/var|\/home|\*)/, decision: "deny", reason: "destructive recursive deletion on critical paths" },
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
  { pattern: />\s*~\/.ssh\//, decision: "deny", reason: "writing to SSH config directory" },
  { pattern: /\.env(\.\w+)?$/, decision: "require_human", reason: "modifying environment variable file" },
];

const SAFE_PATTERNS: RiskRule[] = [
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|date|which|whoami|uname)\s/, decision: "approve", reason: "read-only/display command" },
  { pattern: /^(node|npm|npx|yarn|pnpm|bun)\s+/, decision: "approve", reason: "node/npm tooling" },
  { pattern: /^git\s+status\s*$/, decision: "approve", reason: "git status is safe" },
  { pattern: /^git\s+diff\s*/, decision: "approve", reason: "git diff is read-only" },
  { pattern: /^git\s+log\s*/, decision: "approve", reason: "git log is read-only" },
  { pattern: /^git\s+branch\s*/, decision: "approve", reason: "git branch listing is safe" },
  { pattern: /^git\s+stash\s*/, decision: "approve", reason: "git stash is safe" },
  { pattern: /^(type|typecheck|lint|test|build|dev|start)\s*$/, decision: "approve", reason: "common dev script" },
  { pattern: /^(mkdir|touch)\s/, decision: "approve", reason: "simple file/dir creation" },
  { pattern: /^(python|python3|node)\s+-c\s/, decision: "approve", reason: "inline script execution" },
];

const EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".jsonc", ".md", ".css", ".html", ".yaml", ".yml", ".toml", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp"];

const EDIT_SENSITIVE_PATHS = ["/etc/", "/usr/", "/var/", "/boot/", "~/.ssh/", "~/.gnupg/", ".env", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".git/config"];

export function reviewAction(context: ActionContext): ReviewDecision {
  const { permission, command, args } = context;

  if (permission.type === "bash" && command) {
    const bashResult = reviewBashCommand(command);
    if (bashResult) return bashResult;
  }

  if (permission.type === "edit") {
    const editResult = reviewEditAction(permission, args);
    if (editResult) return editResult;
  }

  if (permission.type === "external_directory") {
    return reviewExternalDirectoryAction(permission);
  }

  return { decision: "approve", reason: "action matches no risk rules" };
}

function reviewBashCommand(command: string): ReviewDecision | null {
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason };
    }
  }

  for (const rule of SAFE_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason };
    }
  }

  if (command.includes("|") || command.includes("&&") || command.includes(";")) {
    return { decision: "require_human", reason: "compound command with pipes or chains" };
  }

  return null;
}

function reviewEditAction(permission: Permission, args?: Record<string, unknown>): ReviewDecision | null {
  const pattern = permission.pattern;
  const path = typeof pattern === "string" ? pattern : Array.isArray(pattern) ? pattern[0] : undefined;

  if (!path) return null;

  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    if (path.includes(sensitive)) {
      return { decision: "require_human", reason: `editing sensitive path: ${sensitive}` };
    }
  }

  const ext = path.substring(path.lastIndexOf("."));
  if (!EDIT_SAFE_EXTENSIONS.includes(ext)) {
    return { decision: "require_human", reason: `editing file with unusual extension: ${ext}` };
  }

  const action = args as { oldString?: string; newString?: string } | undefined;
  if (action?.oldString && action?.newString && action.newString.includes(action.oldString)) {
    const deleted = action.newString.replace(action.oldString, "");
    if (deleted.trim().length === 0 && action.newString.length < action.oldString.length) {
      return { decision: "require_human", reason: "edit appears to delete significant content" };
    }
  }

  return null;
}

function reviewExternalDirectoryAction(permission: Permission): ReviewDecision {
  const path = typeof permission.pattern === "string" ? permission.pattern : Array.isArray(permission.pattern) ? permission.pattern[0] : undefined;

  if (!path) return { decision: "approve", reason: "no specific path to review" };

  if (path.startsWith("/tmp") || path.startsWith("/var/folders") || path.includes("/.cache/")) {
    return { decision: "approve", reason: "temp/cache directory access" };
  }

  return { decision: "require_human", reason: `external directory outside temp/cache: ${path}` };
}
