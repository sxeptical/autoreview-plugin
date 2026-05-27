// reviewer.ts
var DANGEROUS_PATTERNS = [
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
  { pattern: /\.env(\.\w+)?$/, decision: "require_human", reason: "modifying environment variable file" }
];
var SAFE_PATTERNS = [
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
  { pattern: /^(python|python3|node)\s+-c\s/, decision: "approve", reason: "inline script execution" }
];
var EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".jsonc", ".md", ".css", ".html", ".yaml", ".yml", ".toml", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp"];
var EDIT_SENSITIVE_PATHS = ["/etc/", "/usr/", "/var/", "/boot/", "~/.ssh/", "~/.gnupg/", ".env", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".git/config"];
function reviewAction(context) {
  const { permission, command, args } = context;
  if (permission.type === "bash" && command) {
    const bashResult = reviewBashCommand(command);
    if (bashResult)
      return bashResult;
  }
  if (permission.type === "edit") {
    const editResult = reviewEditAction(permission, args);
    if (editResult)
      return editResult;
  }
  if (permission.type === "external_directory") {
    return reviewExternalDirectoryAction(permission);
  }
  return { decision: "approve", reason: "action matches no risk rules" };
}
function reviewBashCommand(command) {
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason };
    }
  }
  if (command.includes("|") || command.includes("&&") || command.includes(";")) {
    return { decision: "require_human", reason: "compound command with pipes or chains" };
  }
  for (const rule of SAFE_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason };
    }
  }
  return { decision: "require_human", reason: "command is not allowlisted by auto-review" };
}
function reviewEditAction(permission, args) {
  const pattern = permission.pattern;
  const path = typeof pattern === "string" ? pattern : Array.isArray(pattern) ? pattern[0] : undefined;
  if (!path)
    return null;
  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    if (path.includes(sensitive)) {
      return { decision: "require_human", reason: `editing sensitive path: ${sensitive}` };
    }
  }
  const ext = path.substring(path.lastIndexOf("."));
  if (!EDIT_SAFE_EXTENSIONS.includes(ext)) {
    return { decision: "require_human", reason: `editing file with unusual extension: ${ext}` };
  }
  const action = args;
  if (typeof action?.oldString === "string" && typeof action?.newString === "string") {
    const oldLen = action.oldString.trim().length;
    const newLen = action.newString.trim().length;
    if (oldLen > 0 && newLen === 0) {
      return { decision: "require_human", reason: "edit clears an existing code/content block" };
    }
    if (oldLen >= 300 && newLen < oldLen * 0.2) {
      return { decision: "require_human", reason: "edit appears to remove most of a large content block" };
    }
  }
  return null;
}
function reviewExternalDirectoryAction(permission) {
  const path = typeof permission.pattern === "string" ? permission.pattern : Array.isArray(permission.pattern) ? permission.pattern[0] : undefined;
  if (!path)
    return { decision: "approve", reason: "no specific path to review" };
  if (path.startsWith("/tmp") || path.startsWith("/var/folders") || path.includes("/.cache/")) {
    return { decision: "approve", reason: "temp/cache directory access" };
  }
  return { decision: "require_human", reason: `external directory outside temp/cache: ${path}` };
}

// approval.ts
function applyDecision(decision) {
  switch (decision.decision) {
    case "approve":
      return "allow";
    case "deny":
      return "deny";
    case "require_human":
      return "ask";
    default:
      return "ask";
  }
}

// action-hook.ts
var REVIEWED_CALLS = new Set;
var REVIEWED_DECISIONS = new Map;
function trackReviewed(callID) {
  REVIEWED_CALLS.add(callID);
}
function isReviewed(callID) {
  return REVIEWED_CALLS.has(callID);
}
function clearReviewed(callID) {
  REVIEWED_CALLS.delete(callID);
}
function trackReviewedDecision(callID, decision) {
  REVIEWED_DECISIONS.set(callID, decision);
}
function getReviewedDecision(callID) {
  return REVIEWED_DECISIONS.get(callID);
}
function clearReviewedDecision(callID) {
  REVIEWED_DECISIONS.delete(callID);
}
function buildBashContext(command, callID) {
  return {
    permission: {
      id: callID,
      type: "bash",
      sessionID: "",
      messageID: "",
      title: "bash command",
      metadata: {},
      time: { created: Date.now() }
    },
    toolName: "bash",
    command
  };
}
function buildEditContext(filePath, callID, args) {
  return {
    permission: {
      id: callID,
      type: "edit",
      sessionID: "",
      messageID: "",
      title: "file edit",
      metadata: {},
      time: { created: Date.now() },
      pattern: filePath
    },
    toolName: "edit",
    args
  };
}

// index.ts
var AutoReviewPlugin = async ({ client, directory, worktree }) => {
  const permissionCallID = (permission) => permission.callID ?? permission.id;
  return {
    "permission.ask": async (permission, output) => {
      if (permission.type === "edit" || permission.type === "external_directory") {
        const decision = reviewAction({
          permission,
          toolName: permission.type
        });
        trackReviewedDecision(permissionCallID(permission), decision.decision);
        output.status = applyDecision(decision);
        return;
      }
      if (permission.type === "bash") {
        const cmd = typeof permission.pattern === "string" ? permission.pattern : Array.isArray(permission.pattern) ? permission.pattern[0] : undefined;
        if (cmd && cmd !== "*") {
          const decision = reviewAction(buildBashContext(cmd, permission.id));
          trackReviewedDecision(permissionCallID(permission), decision.decision);
          output.status = applyDecision(decision);
          return;
        }
        trackReviewedDecision(permissionCallID(permission), "require_human");
        output.status = "ask";
      }
    },
    "tool.execute.before": async (input, output) => {
      const { tool, callID } = input;
      if (tool === "bash" && output.args?.command) {
        const cmd = String(output.args.command);
        const decision = reviewAction(buildBashContext(cmd, callID));
        const preReviewedDecision = getReviewedDecision(callID);
        if (decision.decision === "deny") {
          throw new Error(`auto-review blocked command: ${decision.reason}`);
        } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
          throw new Error(`auto-review requires manual approval: ${decision.reason}`);
        }
        trackReviewed(callID);
        return;
      }
      if (tool === "edit" && output.args?.filePath) {
        const decision = reviewAction(buildEditContext(String(output.args.filePath), callID, output.args));
        const preReviewedDecision = getReviewedDecision(callID);
        if (decision.decision === "deny") {
          throw new Error(`auto-review blocked edit: ${decision.reason}`);
        } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
          throw new Error(`auto-review requires manual approval: ${decision.reason}`);
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      clearReviewedDecision(input.callID);
      if (!isReviewed(input.callID))
        return;
      clearReviewed(input.callID);
      if (input.tool === "bash") {
        const outputText = String(output.output || "");
        if (outputText === "") {
          output.title = "auto-review: command blocked";
        }
      }
      if (input.tool === "edit") {
        const outputText = String(output.output || "");
        if (outputText === "") {
          output.title = "auto-review: edit blocked";
        }
      }
    }
  };
};
export {
  AutoReviewPlugin
};
