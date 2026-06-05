# AutoReview Plugin Effect-TS Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the autoreview-plugin from plain TypeScript to Effect-TS with better error handling and testability while keeping the external plugin API identical.

**Architecture:** Use Effect Services with dependency injection via Layers. Domain types use Schema for validation. State management uses Ref instead of mutable Set/Map. Errors are typed using Data.TaggedError.

**Tech Stack:** Effect-TS 3.x, TypeScript 5.3+, Vitest for testing, Bun for building

---

## File Structure

```
autoreview-plugin/
├── src/
│   ├── index.ts                    # Plugin entry point (unchanged API)
│   ├── domain/
│   │   ├── ReviewDecision.ts       # Schema + types for decisions
│   │   ├── ActionContext.ts        # Schema + types for contexts
│   │   └── Errors.ts               # Typed errors
│   ├── services/
│   │   ├── Reviewer.ts             # Review service + Layer
│   │   ├── Approval.ts             # Approval service + Layer
│   │   └── ReviewedState.ts        # State tracking service + Layer
│   ├── rules/
│   │   ├── dangerous.ts            # Dangerous pattern rules
│   │   └── safe.ts                 # Safe pattern rules
│   └── plugin/
│       └── hooks.ts                # Hook implementations
├── test/
│   ├── Reviewer.test.ts
│   ├── Approval.test.ts
│   └── ReviewedState.test.ts
├── package.json
└── tsconfig.json
```

---

## Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Update package.json with Effect dependencies**

```json
{
  "name": "@sxeptical/autoreview-plugin",
  "version": "1.0.0",
  "description": "Lightweight Auto-review plugin for OpenCode — intercepts shell commands, git commands, and filesystem writes for automated risk assessment",
  "type": "module",
  "main": "./out/index.js",
  "source": "./src/index.ts",
  "files": ["out/", "src/"],
  "keywords": ["opencode", "opencode-plugin", "auto-review", "security", "code-review"],
  "license": "MIT",
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.0.0"
  },
  "dependencies": {
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^1.3.0",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3"
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=out --target=node --format=esm",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./out",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "test"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `bun install`
Expected: Dependencies installed successfully

- [ ] **Step 4: Create directory structure**

Run: `mkdir -p src/domain src/services src/rules src/plugin test`
Expected: Directories created

- [ ] **Step 5: Commit project setup**

```bash
git add package.json tsconfig.json
git commit -m "chore: setup project for Effect-TS rewrite"
```

---

## Task 2: Domain Types - ReviewDecision

**Files:**
- Create: `src/domain/ReviewDecision.ts`
- Test: `test/ReviewDecision.test.ts`

- [ ] **Step 1: Write failing test for ReviewDecision schema**

```typescript
// test/ReviewDecision.test.ts
import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { ReviewDecision, DecisionType } from "../src/domain/ReviewDecision.js"

describe("ReviewDecision", () => {
  it("creates valid approve decision", () => {
    const decision = new ReviewDecision({
      decision: "approve",
      reason: "safe command"
    })
    expect(decision.decision).toBe("approve")
    expect(decision.reason).toBe("safe command")
  })

  it("creates valid deny decision", () => {
    const decision = new ReviewDecision({
      decision: "deny",
      reason: "dangerous command"
    })
    expect(decision.decision).toBe("deny")
  })

  it("creates valid require_human decision", () => {
    const decision = new ReviewDecision({
      decision: "require_human",
      reason: "needs approval"
    })
    expect(decision.decision).toBe("require_human")
  })

  it("rejects invalid decision type", () => {
    expect(() => {
      new ReviewDecision({
        decision: "invalid" as any,
        reason: "test"
      })
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/ReviewDecision.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement ReviewDecision schema**

```typescript
// src/domain/ReviewDecision.ts
import { Schema } from "effect"

export const DecisionType = Schema.Union(
  Schema.Literal("approve"),
  Schema.Literal("deny"),
  Schema.Literal("require_human")
)

export type DecisionType = Schema.Schema.Type<typeof DecisionType>

export class ReviewDecision extends Schema.Class<ReviewDecision>("ReviewDecision")({
  decision: DecisionType,
  reason: Schema.String
}) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/ReviewDecision.test.ts`
Expected: PASS

- [ ] **Step 5: Commit ReviewDecision**

```bash
git add src/domain/ReviewDecision.ts test/ReviewDecision.test.ts
git commit -m "feat: add ReviewDecision schema and types"
```

---

## Task 3: Domain Types - ActionContext

**Files:**
- Create: `src/domain/ActionContext.ts`
- Test: `test/ActionContext.test.ts`

- [ ] **Step 1: Write failing test for ActionContext**

```typescript
// test/ActionContext.test.ts
import { describe, it, expect } from "vitest"
import { ActionContext } from "../src/domain/ActionContext.js"

describe("ActionContext", () => {
  it("creates bash action context", () => {
    const ctx = new ActionContext({
      permission: {
        id: "test-id",
        type: "bash",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "bash command",
        metadata: {},
        time: { created: Date.now() }
      },
      toolName: "bash",
      command: "ls -la"
    })
    expect(ctx.toolName).toBe("bash")
    expect(ctx.command).toBe("ls -la")
  })

  it("creates edit action context", () => {
    const ctx = new ActionContext({
      permission: {
        id: "test-id",
        type: "edit",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "file edit",
        metadata: {},
        time: { created: Date.now() },
        pattern: "/path/to/file.ts"
      },
      toolName: "edit",
      args: { oldString: "foo", newString: "bar" }
    })
    expect(ctx.toolName).toBe("edit")
    expect(ctx.args).toEqual({ oldString: "foo", newString: "bar" })
  })

  it("creates external_directory action context", () => {
    const ctx = new ActionContext({
      permission: {
        id: "test-id",
        type: "external_directory",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "external directory",
        metadata: {},
        time: { created: Date.now() },
        pattern: "/tmp/test"
      },
      toolName: "external_directory"
    })
    expect(ctx.toolName).toBe("external_directory")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/ActionContext.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement ActionContext schema**

```typescript
// src/domain/ActionContext.ts
import { Schema } from "effect"

const PermissionSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Union(
    Schema.Literal("bash"),
    Schema.Literal("edit"),
    Schema.Literal("external_directory")
  ),
  sessionID: Schema.String,
  messageID: Schema.String,
  title: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  time: Schema.Struct({
    created: Schema.Number
  }),
  pattern: Schema.optional(Schema.Union(Schema.String, Schema.Array(Schema.String)))
})

export class ActionContext extends Schema.Class<ActionContext>("ActionContext")({
  permission: PermissionSchema,
  toolName: Schema.String,
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
}) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/ActionContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit ActionContext**

```bash
git add src/domain/ActionContext.ts test/ActionContext.test.ts
git commit -m "feat: add ActionContext schema and types"
```

---

## Task 4: Domain Types - Errors

**Files:**
- Create: `src/domain/Errors.ts`
- Test: `test/Errors.test.ts`

- [ ] **Step 1: Write failing test for typed errors**

```typescript
// test/Errors.test.ts
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import {
  BlockedCommandError,
  RequiresHumanApprovalError,
  BlockedEditError
} from "../src/domain/Errors.js"

describe("Typed Errors", () => {
  it("creates BlockedCommandError", () => {
    const error = new BlockedCommandError({ reason: "dangerous command" })
    expect(error._tag).toBe("BlockedCommandError")
    expect(error.reason).toBe("dangerous command")
  })

  it("creates RequiresHumanApprovalError", () => {
    const error = new RequiresHumanApprovalError({ reason: "needs approval" })
    expect(error._tag).toBe("RequiresHumanApprovalError")
    expect(error.reason).toBe("needs approval")
  })

  it("creates BlockedEditError", () => {
    const error = new BlockedEditError({ reason: "sensitive path" })
    expect(error._tag).toBe("BlockedEditError")
    expect(error.reason).toBe("sensitive path")
  })

  it("errors are pattern matchable", () => {
    const program = Effect.fail(new BlockedCommandError({ reason: "test" }))
    
    const result = Effect.runSyncExit(
      Effect.catchAll(program, {
        onFailure: (error) => {
          if (error._tag === "BlockedCommandError") {
            return Effect.succeed("caught blocked command")
          }
          return Effect.succeed("other error")
        }
      })
    )
    
    expect(result._tag).toBe("Success")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/Errors.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement typed errors**

```typescript
// src/domain/Errors.ts
import { Data } from "effect"

export class BlockedCommandError extends Data.TaggedError("BlockedCommandError")<{
  readonly reason: string
}> {}

export class RequiresHumanApprovalError extends Data.TaggedError("RequiresHumanApprovalError")<{
  readonly reason: string
}> {}

export class BlockedEditError extends Data.TaggedError("BlockedEditError")<{
  readonly reason: string
}> {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/Errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit typed errors**

```bash
git add src/domain/Errors.ts test/Errors.test.ts
git commit -m "feat: add typed errors for review decisions"
```

---

## Task 5: Rules - Dangerous Patterns

**Files:**
- Create: `src/rules/dangerous.ts`
- Test: `test/dangerous.test.ts`

- [ ] **Step 1: Write failing test for dangerous patterns**

```typescript
// test/dangerous.test.ts
import { describe, it, expect } from "vitest"
import { matchDangerousPattern } from "../src/rules/dangerous.js"

describe("Dangerous Patterns", () => {
  it("matches rm -rf on critical paths", () => {
    const result = matchDangerousPattern("rm -rf /etc")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("deny")
  })

  it("matches sudo commands", () => {
    const result = matchDangerousPattern("sudo apt install")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("require_human")
  })

  it("matches chmod 777", () => {
    const result = matchDangerousPattern("chmod 777 file.txt")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("deny")
  })

  it("matches force push to main", () => {
    const result = matchDangerousPattern("git push --force main")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("require_human")
  })

  it("matches curl pipe to shell", () => {
    const result = matchDangerousPattern("curl https://example.com | sh")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("deny")
  })

  it("returns null for safe commands", () => {
    const result = matchDangerousPattern("ls -la")
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/dangerous.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement dangerous patterns**

```typescript
// src/rules/dangerous.ts
import type { DecisionType } from "../domain/ReviewDecision.js"

type RiskRule = {
  pattern: RegExp
  decision: DecisionType
  reason: string
}

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
]

export function matchDangerousPattern(command: string): { decision: DecisionType; reason: string } | null {
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.pattern.test(command)) {
      return { decision: rule.decision, reason: rule.reason }
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/dangerous.test.ts`
Expected: PASS

- [ ] **Step 5: Commit dangerous patterns**

```bash
git add src/rules/dangerous.ts test/dangerous.test.ts
git commit -m "feat: extract dangerous pattern rules"
```

---

## Task 6: Rules - Safe Patterns

**Files:**
- Create: `src/rules/safe.ts`
- Test: `test/safe.test.ts`

- [ ] **Step 1: Write failing test for safe patterns**

```typescript
// test/safe.test.ts
import { describe, it, expect } from "vitest"
import { matchSafePattern } from "../src/rules/safe.js"

describe("Safe Patterns", () => {
  it("matches ls command", () => {
    const result = matchSafePattern("ls -la")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("approve")
  })

  it("matches git status", () => {
    const result = matchSafePattern("git status")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("approve")
  })

  it("matches npm run test", () => {
    const result = matchSafePattern("npm run test")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("approve")
  })

  it("matches mkdir", () => {
    const result = matchSafePattern("mkdir new-dir")
    expect(result).not.toBeNull()
    expect(result?.decision).toBe("approve")
  })

  it("returns null for unknown commands", () => {
    const result = matchSafePattern("custom-command")
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/safe.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement safe patterns**

```typescript
// src/rules/safe.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/safe.test.ts`
Expected: PASS

- [ ] **Step 5: Commit safe patterns**

```bash
git add src/rules/safe.ts test/safe.test.ts
git commit -m "feat: extract safe pattern rules"
```

---

## Task 7: Service - ReviewedState

**Files:**
- Create: `src/services/ReviewedState.ts`
- Test: `test/ReviewedState.test.ts`

- [ ] **Step 1: Write failing test for ReviewedState service**

```typescript
// test/ReviewedState.test.ts
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { ReviewedState, ReviewedStateLive } from "../src/services/ReviewedState.js"

describe("ReviewedState Service", () => {
  it("tracks and checks reviewed calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.track("call-1")
      const isReviewed = yield* state.isReviewed("call-1")
      
      expect(isReviewed).toBe(true)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("returns false for untracked calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      const isReviewed = yield* state.isReviewed("unknown")
      
      expect(isReviewed).toBe(false)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("clears reviewed calls", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.track("call-1")
      yield* state.clear("call-1")
      const isReviewed = yield* state.isReviewed("call-1")
      
      expect(isReviewed).toBe(false)
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("tracks and retrieves decisions", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.trackDecision("call-1", "approve")
      const decision = yield* state.getDecision("call-1")
      
      expect(decision).toBe("approve")
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))

  it("clears decisions", () =>
    Effect.gen(function* () {
      const state = yield* ReviewedState
      
      yield* state.trackDecision("call-1", "approve")
      yield* state.clearDecision("call-1")
      const decision = yield* state.getDecision("call-1")
      
      expect(decision).toBeUndefined()
    }).pipe(Effect.provide(ReviewedStateLive), Effect.runPromise))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/ReviewedState.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement ReviewedState service**

```typescript
// src/services/ReviewedState.ts
import { Context, Effect, Layer, Ref } from "effect"
import type { DecisionType } from "../domain/ReviewDecision.js"

export class ReviewedState extends Context.Tag("ReviewedState")<
  ReviewedState,
  {
    readonly track: (callID: string) => Effect.Effect<void, never>
    readonly isReviewed: (callID: string) => Effect.Effect<boolean, never>
    readonly clear: (callID: string) => Effect.Effect<void, never>
    readonly trackDecision: (callID: string, decision: DecisionType) => Effect.Effect<void, never>
    readonly getDecision: (callID: string) => Effect.Effect<DecisionType | undefined, never>
    readonly clearDecision: (callID: string) => Effect.Effect<void, never>
  }
>() {}

export const ReviewedStateLive = Layer.effect(
  ReviewedState,
  Effect.gen(function* () {
    const reviewedRef = yield* Ref.make<Set<string>>(new Set())
    const decisionsRef = yield* Ref.make<Map<string, DecisionType>>(new Map())

    return {
      track: (callID: string) =>
        Ref.update(reviewedRef, (set) => new Set([...set, callID])),
      
      isReviewed: (callID: string) =>
        Ref.get(reviewedRef).pipe(Effect.map((set) => set.has(callID))),
      
      clear: (callID: string) =>
        Ref.update(reviewedRef, (set) => {
          const newSet = new Set(set)
          newSet.delete(callID)
          return newSet
        }),
      
      trackDecision: (callID: string, decision: DecisionType) =>
        Ref.update(decisionsRef, (map) => new Map([...map, [callID, decision]])),
      
      getDecision: (callID: string) =>
        Ref.get(decisionsRef).pipe(Effect.map((map) => map.get(callID))),
      
      clearDecision: (callID: string) =>
        Ref.update(decisionsRef, (map) => {
          const newMap = new Map(map)
          newMap.delete(callID)
          return newMap
        }),
    }
  })
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/ReviewedState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit ReviewedState service**

```bash
git add src/services/ReviewedState.ts test/ReviewedState.test.ts
git commit -m "feat: implement ReviewedState service with Ref-based state"
```

---

## Task 8: Service - Approval

**Files:**
- Create: `src/services/Approval.ts`
- Test: `test/Approval.test.ts`

- [ ] **Step 1: Write failing test for Approval service**

```typescript
// test/Approval.test.ts
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { Approval, ApprovalLive } from "../src/services/Approval.js"
import { ReviewDecision } from "../src/domain/ReviewDecision.js"

describe("Approval Service", () => {
  it("returns allow for approve decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "approve", reason: "safe" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("allow")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))

  it("returns deny for deny decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "deny", reason: "dangerous" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("deny")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))

  it("returns ask for require_human decision", () =>
    Effect.gen(function* () {
      const approval = yield* Approval
      const decision = new ReviewDecision({ decision: "require_human", reason: "needs approval" })
      
      const status = yield* approval.applyDecision(decision)
      
      expect(status).toBe("ask")
    }).pipe(Effect.provide(ApprovalLive), Effect.runPromise))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/Approval.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement Approval service**

```typescript
// src/services/Approval.ts
import { Context, Effect, Layer } from "effect"
import { ReviewDecision } from "../domain/ReviewDecision.js"

export type ApprovalStatus = "allow" | "deny" | "ask"

export class Approval extends Context.Tag("Approval")<
  Approval,
  {
    readonly applyDecision: (decision: ReviewDecision) => Effect.Effect<ApprovalStatus, never>
  }
>() {}

export const ApprovalLive = Layer.succeed(
  Approval,
  {
    applyDecision: (decision: ReviewDecision) =>
      Effect.sync(() => {
        switch (decision.decision) {
          case "approve":
            console.log(`[auto-review] APPROVED: ${decision.reason}`)
            return "allow"
          case "deny":
            console.log(`[auto-review] DENIED: ${decision.reason}`)
            return "deny"
          case "require_human":
            console.log(`[auto-review] ESCALATED: ${decision.reason}`)
            return "ask"
        }
      }),
  }
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/Approval.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Approval service**

```bash
git add src/services/Approval.ts test/Approval.test.ts
git commit -m "feat: implement Approval service"
```

---

## Task 9: Service - Reviewer

**Files:**
- Create: `src/services/Reviewer.ts`
- Test: `test/Reviewer.test.ts`

- [ ] **Step 1: Write failing test for Reviewer service**

```typescript
// test/Reviewer.test.ts
import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { Reviewer, ReviewerLive } from "../src/services/Reviewer.js"

describe("Reviewer Service", () => {
  it("denies dangerous bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("rm -rf /etc")
      
      expect(result.decision).toBe("deny")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("approves safe bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("ls -la")
      
      expect(result.decision).toBe("approve")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates unknown bash commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("custom-command")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates compound commands", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewBash("ls | grep foo")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("escalates edits to sensitive paths", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewEdit("/etc/passwd")
      
      expect(result.decision).toBe("require_human")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  it("approves edits to safe paths", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      
      const result = yield* reviewer.reviewEdit("/home/user/project/file.ts")
      
      expect(result.decision).toBe("approve")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/Reviewer.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement Reviewer service**

```typescript
// src/services/Reviewer.ts
import { Context, Effect, Layer } from "effect"
import { ReviewDecision } from "../domain/ReviewDecision.js"
import { matchDangerousPattern } from "../rules/dangerous.js"
import { matchSafePattern } from "../rules/safe.js"

const EDIT_SAFE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".jsonc", ".md", ".css", ".html", ".yaml", ".yml", ".toml", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h", ".hpp"]

const EDIT_SENSITIVE_PATHS = ["/etc/", "/usr/", "/var/", "/boot/", "~/.ssh/", "~/.gnupg/", ".env", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".git/config"]

export class Reviewer extends Context.Tag("Reviewer")<
  Reviewer,
  {
    readonly reviewBash: (command: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.Effect<ReviewDecision, never>
    readonly reviewExternalDirectory: (path: string) => Effect.Effect<ReviewDecision, never>
  }
>() {}

function reviewBashCommand(command: string): ReviewDecision {
  const dangerousMatch = matchDangerousPattern(command)
  if (dangerousMatch) {
    return new ReviewDecision(dangerousMatch)
  }

  if (command.includes("|") || command.includes("&&") || command.includes(";")) {
    return new ReviewDecision({ decision: "require_human", reason: "compound command with pipes or chains" })
  }

  const safeMatch = matchSafePattern(command)
  if (safeMatch) {
    return new ReviewDecision(safeMatch)
  }

  return new ReviewDecision({ decision: "require_human", reason: "command is not allowlisted by auto-review" })
}

function reviewEditAction(path: string, args?: Record<string, unknown>): ReviewDecision {
  for (const sensitive of EDIT_SENSITIVE_PATHS) {
    if (path.includes(sensitive)) {
      return new ReviewDecision({ decision: "require_human", reason: `editing sensitive path: ${sensitive}` })
    }
  }

  const ext = path.substring(path.lastIndexOf("."))
  if (!EDIT_SAFE_EXTENSIONS.includes(ext)) {
    return new ReviewDecision({ decision: "require_human", reason: `editing file with unusual extension: ${ext}` })
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

  return new ReviewDecision({ decision: "approve", reason: "edit is safe" })
}

function reviewExternalDirectoryAction(path: string): ReviewDecision {
  if (path.startsWith("/tmp") || path.startsWith("/var/folders") || path.includes("/.cache/")) {
    return new ReviewDecision({ decision: "approve", reason: "temp/cache directory access" })
  }

  return new ReviewDecision({ decision: "require_human", reason: `external directory outside temp/cache: ${path}` })
}

export const ReviewerLive = Layer.succeed(
  Reviewer,
  {
    reviewBash: (command: string) => Effect.sync(() => reviewBashCommand(command)),
    reviewEdit: (path: string, args?: Record<string, unknown>) => Effect.sync(() => reviewEditAction(path, args)),
    reviewExternalDirectory: (path: string) => Effect.sync(() => reviewExternalDirectoryAction(path)),
  }
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/Reviewer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Reviewer service**

```bash
git add src/services/Reviewer.ts test/Reviewer.test.ts
git commit -m "feat: implement Reviewer service"
```

---

## Task 10: Plugin Hooks

**Files:**
- Create: `src/plugin/hooks.ts`

- [ ] **Step 1: Implement plugin hooks**

```typescript
// src/plugin/hooks.ts
import { Effect } from "effect"
import type { Permission } from "@opencode-ai/sdk"
import { Reviewer } from "../services/Reviewer.js"
import { Approval } from "../services/Approval.js"
import { ReviewedState } from "../services/ReviewedState.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "../domain/Errors.js"

type ApprovalOutput = {
  status: "allow" | "deny" | "ask"
}

type ToolInput = {
  tool: string
  callID: string
}

type ToolOutput = {
  args?: Record<string, unknown>
  output?: unknown
  title?: string
}

const permissionCallID = (permission: { id: string; callID?: string }) => permission.callID ?? permission.id

export function handlePermissionAsk(
  permission: Permission,
  output: ApprovalOutput
): Effect.Effect<void, never, Reviewer | Approval | ReviewedState> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const approval = yield* Approval
    const state = yield* ReviewedState

    if (permission.type === "edit" || permission.type === "external_directory") {
      const context = permission.type === "edit"
        ? yield* reviewer.reviewEdit(String(permission.pattern ?? ""), {})
        : yield* reviewer.reviewExternalDirectory(String(permission.pattern ?? ""))
      
      yield* state.trackDecision(permissionCallID(permission), context.decision)
      const status = yield* approval.applyDecision(context)
      output.status = status
      return
    }

    if (permission.type === "bash") {
      const cmd = typeof permission.pattern === "string"
        ? permission.pattern
        : Array.isArray(permission.pattern)
          ? permission.pattern[0]
          : undefined

      if (cmd && cmd !== "*") {
        const decision = yield* reviewer.reviewBash(cmd)
        yield* state.trackDecision(permissionCallID(permission), decision.decision)
        const status = yield* approval.applyDecision(decision)
        output.status = status
        return
      }

      yield* state.trackDecision(permissionCallID(permission), "require_human")
      output.status = "ask"
    }
  })
}

export function handleToolExecuteBefore(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, BlockedCommandError | BlockedEditError | RequiresHumanApprovalError, Reviewer | ReviewedState> {
  return Effect.gen(function* () {
    const reviewer = yield* Reviewer
    const state = yield* ReviewedState

    if (input.tool === "bash" && output.args?.command) {
      const cmd = String(output.args.command)
      const decision = yield* reviewer.reviewBash(cmd)
      const preReviewedDecision = yield* state.getDecision(input.callID)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedCommandError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }

      yield* state.track(input.callID)
      return
    }

    if (input.tool === "edit" && output.args?.filePath) {
      const decision = yield* reviewer.reviewEdit(String(output.args.filePath), output.args)
      const preReviewedDecision = yield* state.getDecision(input.callID)

      if (decision.decision === "deny") {
        return yield* Effect.fail(new BlockedEditError({ reason: decision.reason }))
      } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
        return yield* Effect.fail(new RequiresHumanApprovalError({ reason: decision.reason }))
      }
    }
  })
}

export function handleToolExecuteAfter(
  input: ToolInput,
  output: ToolOutput
): Effect.Effect<void, never, ReviewedState> {
  return Effect.gen(function* () {
    const state = yield* ReviewedState

    yield* state.clearDecision(input.callID)
    const isReviewed = yield* state.isReviewed(input.callID)
    
    if (!isReviewed) return
    
    yield* state.clear(input.callID)

    if (input.tool === "bash" || input.tool === "edit") {
      const outputText = String(output.output || "")
      if (outputText === "") {
        output.title = input.tool === "bash" ? "auto-review: command blocked" : "auto-review: edit blocked"
      }
    }
  })
}
```

- [ ] **Step 2: Commit plugin hooks**

```bash
git add src/plugin/hooks.ts
git commit -m "feat: implement plugin hooks using Effect services"
```

---

## Task 11: Plugin Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement plugin entry point**

```typescript
// src/index.ts
import { Effect, Layer, ManagedRuntime } from "effect"
import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { ReviewerLive } from "./services/Reviewer.js"
import { ApprovalLive } from "./services/Approval.js"
import { ReviewedStateLive } from "./services/ReviewedState.js"
import {
  handlePermissionAsk,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
} from "./plugin/hooks.js"
import { BlockedCommandError, BlockedEditError, RequiresHumanApprovalError } from "./domain/Errors.js"

const AppLayer = Layer.mergeAll(ReviewerLive, ApprovalLive, ReviewedStateLive)
const runtime = ManagedRuntime.make(AppLayer)

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    "permission.ask": (permission, output) => {
      runtime.runPromise(handlePermissionAsk(permission, output))
    },

    "tool.execute.before": (input, output) => {
      runtime.runPromise(
        handleToolExecuteBefore(input, output).pipe(
          Effect.catchAll((error) => {
            if (error instanceof BlockedCommandError) {
              throw new Error(`auto-review blocked command: ${error.reason}`)
            }
            if (error instanceof BlockedEditError) {
              throw new Error(`auto-review blocked edit: ${error.reason}`)
            }
            if (error instanceof RequiresHumanApprovalError) {
              throw new Error(`auto-review requires manual approval: ${error.reason}`)
            }
            throw error
          })
        )
      )
    },

    "tool.execute.after": (input, output) => {
      runtime.runPromise(handleToolExecuteAfter(input, output))
    },
  } satisfies Hooks
}
```

- [ ] **Step 2: Commit plugin entry point**

```bash
git add src/index.ts
git commit -m "feat: implement plugin entry point with ManagedRuntime"
```

---

## Task 12: Build and Verify

**Files:**
- Modify: `package.json` (if needed)

- [ ] **Step 1: Build the plugin**

Run: `bun run build`
Expected: Build succeeds, output in `out/`

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 3: Verify output structure**

Run: `ls -la out/`
Expected: `index.js` exists

- [ ] **Step 4: Commit final build verification**

```bash
git add -A
git commit -m "chore: verify build and tests pass"
```

---

## Task 13: Cleanup Old Files

**Files:**
- Delete: `index.ts` (root)
- Delete: `reviewer.ts` (root)
- Delete: `approval.ts` (root)
- Delete: `action-hook.ts` (root)

- [ ] **Step 1: Remove old TypeScript files**

Run: `rm index.ts reviewer.ts approval.ts action-hook.ts`
Expected: Old files removed

- [ ] **Step 2: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove old TypeScript files after Effect rewrite"
```

---

## Summary

This plan rewrites the autoreview-plugin from plain TypeScript to Effect-TS with:

- **Domain types** using Schema for validation
- **Typed errors** using Data.TaggedError
- **Services** with dependency injection via Layers
- **Ref-based state** instead of mutable Set/Map
- **Comprehensive tests** for all services
- **Identical external API** for OpenCode compatibility

Total estimated time: ~2-3 hours for implementation and testing.
