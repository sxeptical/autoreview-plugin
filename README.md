# autoreview-plugin

Lightweight Auto-review plugin for [OpenCode](https://opencode.ai) — intercepts shell commands, git commands, and filesystem writes for automated risk assessment. Built on [Effect-TS](https://effect.website).

## How it works

Hooks into OpenCode's plugin system via `permission.ask` and `tool.execute.before`:

```
Main Agent runs action
      ↓
   reviewAction() → pattern matching + path normalization
      ↓
   approve       → allow
   deny          → throws [auto-review] BLOCKED (tool aborts)
   require_human → throws [auto-review] REQUIRES_HUMAN (agent must re-plan)
```

In `permission.ask`, decisions are mapped to OpenCode's status:
- `approve` → `allow`
- `deny` → `deny`
- `require_human` → `ask`

In `tool.execute.before`, both `deny` and `require_human` cause the tool call to throw, so the agent sees the error and must re-plan with a different approach. This prevents the runtime from silently executing risky commands.

## Installation

```json
// opencode.json
{
  "plugin": [
    "sxeptical/autoreview-plugin@git+https://github.com/sxeptical/autoreview-plugin.git"
  ]
}
```

Or locally:

```json
{
  "plugin": ["./plugins/auto-review/out/index.js"]
}
```

## What it reviews

### Bash commands

- **Dangerous** — `rm -rf` on critical paths (incl. `$HOME`, `~`, quoted forms), `sudo`, `chmod 777`, `mkfs`, `dd if=`, fork bombs, `curl|sh`, force-push to main/master, `git reset --hard`, `git clean -fd`, `git stash drop/clear/pop`, `.env` writes, `npm publish/unpublish/deprecate`, DB destructive ops (`DROP TABLE`, etc.)
- **Shell expansion traps** — `$()`, backticks, `||`, newlines, `2>&1|`, `<(...)`, `sh/bash/zsh -c`, `eval`, `exec`, `source` — all flagged for human review
- **Safe (allowlisted)** — bare `ls`/`pwd`/`cat`/`git status`/`git diff`/`git log`/`git branch`/`git show`/`node --version`/`npm list|view|info|why|outdated|doctor`, `npm run type|test|lint|build|check|format`, `mkdir`/`touch`/`cp`/`mv` with no shell metacharacters

### File edits

- **Path normalization** — `path.resolve` + `path.relative` against repo/worktree root, rejects `..` traversal and absolute paths
- **Sensitive paths** — `/etc/`, `/usr/`, `/var/`, `~/.ssh/`, `.env`, `package.json`, lockfiles, `.git/config`, `.git/hooks/`, `.github/workflows/`, `Dockerfile`, `tsconfig.json`, build configs, `.aws/`, `.kube/config`
- **Sensitive file patterns** — `auth*`, `login*`, `permission*`, `security*`, `secret*`, `credential*`, `token*`, `api_key*`, `certificate*`
- **Extension allowlist** — `.ts .tsx .js .jsx .css .html .md` only
- **Bulk-deletion detection** — new content <20% of old content with old ≥300 chars

### External directories

- Auto-approves `/tmp`, `/var/folders`, `/.cache/` paths
- Everything else requires human review

## Build

```bash
bun build src/index.ts --outdir=out --target=node --format=esm
```

## Test

104 tests across 10 files cover bypass attempts, safe allowlist, dangerous patterns, and shell expansion traps:

```bash
npm test
```

## Architecture

```
src/
├── domain/              # Effect Schema types
│   ├── ActionContext.ts
│   ├── ReviewDecision.ts
│   └── Errors.ts
├── rules/               # Pattern matchers
│   ├── dangerous.ts
│   ├── safe.ts
│   └── shell-expansion.ts
├── services/            # Effect services (DI)
│   ├── Reviewer.ts
│   ├── Approval.ts
│   └── ReviewedState.ts
├── plugin/
│   └── hooks.ts         # OpenCode hook implementations
└── index.ts             # Plugin entry point with ManagedRuntime
```

## Known limitations

- Pattern matching is heuristic, not a real shell parser. Compound commands using unusual quoting or aliasing can still bypass the regex.
- The `require_human` decision in `tool.execute.before` is implemented as a thrown error, which the agent must recover from by re-planning. It does not present a real interactive prompt at that hook (use `permission.ask` for true interactive approval).
