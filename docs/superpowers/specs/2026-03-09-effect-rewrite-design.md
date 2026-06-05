# AutoReview Plugin Effect-TS Rewrite Design

**Date:** 2026-03-09  
**Status:** Approved  
**Approach:** Effect Services + Layers (Approach 2)

## Overview

Rewrite the autoreview-plugin from plain TypeScript to Effect-TS, focusing on better error handling and testability while keeping the external plugin API identical.

## Goals

1. **Better error handling** — Use typed errors (`Data.TaggedError`) instead of thrown `Error` objects
2. **Testability** — Use dependency injection via Services/Layers for unit testing
3. **Idiomatic Effect** — Use `Ref` for state, `Schema` for validation, `Effect.gen` for composition
4. **API compatibility** — The OpenCode plugin interface remains unchanged

## Non-Goals

- Full Effect architecture with Config/Runtime (overkill for this plugin)
- Concurrency optimizations (not needed for pattern matching)
- Changing the external plugin behavior

## Architecture

### Module Structure

```
autoreview-plugin/
├── src/
│   ├── index.ts              # Plugin entry point (unchanged API)
│   ├── domain/
│   │   ├── ReviewDecision.ts # Schema + types
│   │   ├── ActionContext.ts  # Schema + types
│   │   └── Errors.ts         # Typed errors
│   ├── services/
│   │   ├── Reviewer.ts       # Review service + Layer
│   │   ├── Approval.ts       # Approval service + Layer
│   │   └── ReviewedState.ts  # State tracking service + Layer
│   ├── rules/
│   │   ├── dangerous.ts      # Dangerous pattern rules
│   │   └── safe.ts           # Safe pattern rules
│   └── plugin/
│       └── hooks.ts          # Hook implementations
├── test/
│   ├── Reviewer.test.ts
│   ├── Approval.test.ts
│   └── ReviewedState.test.ts
├── package.json
└── tsconfig.json
```

### Domain Types

**ReviewDecision:**
```typescript
import { Schema } from "effect"

export const DecisionType = Schema.Union(
  Schema.Literal("approve"),
  Schema.Literal("deny"),
  Schema.Literal("require_human")
)

export class ReviewDecision extends Schema.Class<ReviewDecision>("ReviewDecision")({
  decision: DecisionType,
  reason: Schema.String
}) {}
```

**Typed Errors:**
```typescript
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

### Services

**Reviewer Service:**
```typescript
export class Reviewer extends Context.Tag("Reviewer")<
  Reviewer,
  {
    readonly reviewAction: (context: ActionContext) => Effect.Effect<ReviewDecision, never>
    readonly reviewBash: (command: string) => Effect.Effect<ReviewDecision, never>
    readonly reviewEdit: (path: string, args?: EditArgs) => Effect.Effect<ReviewDecision, never>
  }
>() {}
```

**ReviewedState Service (replaces mutable Set/Map):**
```typescript
export class ReviewedState extends Context.Tag("ReviewedState")<
  ReviewedState,
  {
    readonly track: (callID: string) => Effect.Effect<void, never>
    readonly isReviewed: (callID: string) => Effect.Effect<boolean, never>
    readonly clear: (callID: string) => Effect.Effect<void, never>
    readonly trackDecision: (callID: string, decision: Decision) => Effect.Effect<void, never>
    readonly getDecision: (callID: string) => Effect.Effect<Decision | undefined, never>
    readonly clearDecision: (callID: string) => Effect.Effect<void, never>
  }
>() {}
```

State is managed via `Ref<Set<string>>` and `Ref<Map<string, Decision>>` inside the Live layer.

**Approval Service:**
```typescript
export class Approval extends Context.Tag("Approval")<
  Approval,
  {
    readonly applyDecision: (decision: ReviewDecision) => Effect.Effect<ApprovalStatus, never>
  }
>() {}
```

### Plugin Entry Point

```typescript
const AppLayer = Layer.mergeAll(ReviewerLive, ApprovalLive, ReviewedStateLive)
const runtime = ManagedRuntime.make(AppLayer)

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    "permission.ask": (permission, output) =>
      runtime.runPromise(handlePermissionAsk(permission, output)),
    
    "tool.execute.before": (input, output) =>
      runtime.runPromise(handleToolExecuteBefore(input, output)),
    
    "tool.execute.after": (input, output) =>
      runtime.runPromise(handleToolExecuteAfter(input, output)),
  } satisfies Hooks
}
```

### Testing Strategy

Use `vitest` with Effect's testing utilities:

```typescript
import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import { Reviewer, ReviewerLive } from "../src/services/Reviewer.js"

describe("Reviewer", () => {
  it("denies rm -rf on critical paths", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer
      const result = yield* reviewer.reviewBash("rm -rf /etc")
      expect(result.decision).toBe("deny")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
})
```

Test layers provided for each service to enable isolated unit testing.

## Migration Plan

1. Set up project structure with Effect dependencies
2. Create domain types (ReviewDecision, ActionContext, Errors)
3. Extract pattern rules into separate modules
4. Implement services (Reviewer, Approval, ReviewedState)
5. Implement plugin hooks using services
6. Write comprehensive tests
7. Update package.json with new build configuration
8. Verify build output works with OpenCode

## Dependencies

```json
{
  "dependencies": {
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

## Backwards Compatibility

- The exported `AutoReviewPlugin` function signature remains identical
- All hook names and parameter shapes are unchanged
- Behavior is preserved — same pattern rules, same decisions
- Build output (`out/index.js`) remains ESM for Node
