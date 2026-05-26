// .config/opencode/plugins/auto-review/reviewer.ts
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
  { pattern: /^(node|npm|npx|yarn|pnpm|bun)\s+/, decision: "approve", reason: "node/npm tooling" },
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
  if (action?.oldString && action?.newString && action.newString.includes(action.oldString)) {
    const deleted = action.newString.replace(action.oldString, "");
    if (deleted.trim().length === 0 && action.newString.length < action.oldString.length) {
      return { decision: "require_human", reason: "edit appears to delete significant content" };
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

// .config/opencode/plugins/auto-review/approval.ts
var AUDIT_ENABLED = true;
function applyDecision(decision) {
  switch (decision.decision) {
    case "approve":
      if (AUDIT_ENABLED) {
        logApproval(decision);
      }
      return "allow";
    case "deny":
      logDenial(decision);
      return "deny";
    case "require_human":
      logEscalation(decision);
      return "ask";
    default:
      return "ask";
  }
}
function logApproval(decision) {
  console.log(`[auto-review] APPROVED: ${decision.reason}`);
}
function logDenial(decision) {
  console.log(`[auto-review] DENIED: ${decision.reason}`);
}
function logEscalation(decision) {
  console.log(`[auto-review] ESCALATED: ${decision.reason}`);
}

// .config/opencode/plugins/auto-review/action-hook.ts
var REVIEWED_CALLS = new Set;
function trackReviewed(callID) {
  REVIEWED_CALLS.add(callID);
}
function isReviewed(callID) {
  return REVIEWED_CALLS.has(callID);
}
function clearReviewed(callID) {
  REVIEWED_CALLS.delete(callID);
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

// .config/opencode/plugins/auto-review/index.ts
var AutoReviewPlugin = async ({ client, directory, worktree }) => {
  return {
    "permission.ask": async (permission, output) => {
      if (permission.type === "edit" || permission.type === "external_directory") {
        const decision = reviewAction({
          permission,
          toolName: permission.type
        });
        output.status = applyDecision(decision);
        return;
      }
      if (permission.type === "bash") {
        const cmd = typeof permission.pattern === "string" ? permission.pattern : Array.isArray(permission.pattern) ? permission.pattern[0] : undefined;
        if (cmd && cmd !== "*") {
          const decision = reviewAction(buildBashContext(cmd, permission.id));
          output.status = applyDecision(decision);
        }
      }
    },
    "tool.execute.before": async (input, output) => {
      const { tool, callID } = input;
      if (tool === "bash" && output.args?.command) {
        const cmd = String(output.args.command);
        const decision = reviewAction(buildBashContext(cmd, callID));
        if (decision.decision === "deny") {
          applyDecision(decision);
          output.args.command = `echo "[auto-review] BLOCKED: ${decision.reason}" && exit 1`;
        }
        trackReviewed(callID);
        return;
      }
      if (tool === "edit" && output.args?.filePath) {
        const decision = reviewAction(buildEditContext(String(output.args.filePath), callID, output.args));
        if (decision.decision === "deny") {
          applyDecision(decision);
          output.args = {
            filePath: output.args.filePath,
            oldString: "",
            newString: ""
          };
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      if (!isReviewed(input.callID))
        return;
      clearReviewed(input.callID);
      if (input.tool === "bash") {
        const outputText = String(output.output || "");
        if (outputText.includes("[auto-review] BLOCKED:")) {
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
