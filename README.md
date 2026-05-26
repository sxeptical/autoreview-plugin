# autreview-plugin

Lightweight Auto-review plugin for [OpenCode](https://opencode.ai) — intercepts shell commands, git commands, and filesystem writes for automated risk assessment.

## How it works

Hooks into OpenCode's plugin system via `permission.ask` and `tool.execute.before`:

```
Main Agent runs action
      ↓
   reviewAction() → pattern matching
      ↓
   approve       → allow
   deny          → deny (command replaced with safe no-op)
   require_human → ask (falls through to user prompt)
```

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

- **Bash commands** — 27 pattern rules covering dangerous operations (rm -rf, sudo, curl|sh, force push, hard reset) and safe operations (ls, git status, npm)
- **File edits** — sensitive path detection and extension allowlisting
- **External directories** — auto-approves temp/cache; escalates everything else

## Build

```bash
bun build index.ts --outdir=out --target=node --format=esm
```
