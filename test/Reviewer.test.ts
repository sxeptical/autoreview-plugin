import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { ActionContext } from "../src/domain/ActionContext.js"
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

  it("reviews an ActionContext", () =>
    Effect.gen(function* () {
      const reviewer = yield* Reviewer

      const result = yield* reviewer.reviewAction(new ActionContext({
        permission: {
          id: "call-1",
          type: "bash",
          sessionID: "session-1",
          messageID: "message-1",
          title: "bash command",
          metadata: {},
          time: { created: Date.now() },
        },
        toolName: "bash",
        command: "rm -rf /etc",
      }))

      expect(result.decision).toBe("deny")
    }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

  describe("bash bypass attempts", () => {
    const cases: Array<[string, string, string]> = [
      ["$() substitution", 'echo "$(rm -rf folder)"', "require_human"],
      ["backtick substitution", "ls `rm -rf temp`", "require_human"],
      ["python3 -c inline", `python3 -c "import os; os.system('rm -rf dist')"`, "require_human"],
      ["sh -c wrapping", 'sh -c "rm -rf /"', "deny"],
      ["bash -c wrapping", 'bash -c "rm -rf /tmp/foo"', "deny"],
      ["npm publish", "npm publish", "require_human"],
      ["npm run dev", "npm run dev", "require_human"],
      ["git stash", "git stash", "require_human"],
      ["cat .env (read of risky file)", "cat .env", "require_human"],
      ["bare pwd", "pwd", "approve"],
      ["bare ls", "ls", "approve"],
      ["ls -la", "ls -la", "approve"],
      ["git status", "git status", "approve"],
      ["git diff (bare)", "git diff", "approve"],
      ["git log (bare)", "git log", "approve"],
      ["mkdir -p foo", "mkdir -p foo", "approve"],
    ]

    for (const [label, cmd, want] of cases) {
      it(`${label}: "${cmd}" → ${want}`, () =>
        Effect.gen(function* () {
          const reviewer = yield* Reviewer
          const result = yield* reviewer.reviewBash(cmd)
          expect(result.decision).toBe(want)
        }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
    }
  })

  describe("edit path normalization", () => {
    const riskyEdits: Array<[string, string]> = [
      ["package.json", "package.json"],
      ["package-lock.json", "package-lock.json"],
      [".github/workflows/test.yml", ".github/workflows/test.yml"],
      ["src/auth.ts", "src/auth.ts"],
      ["src/credentials.ts", "src/credentials.ts"],
      ["src/api_keys.ts", "src/api_keys.ts"],
      [".env.example", ".env.example"],
      ["Dockerfile", "Dockerfile"],
      ["tsconfig.json", "tsconfig.json"],
      ["no extension", "Makefile"],
    ]

    for (const [label, path] of riskyEdits) {
      it(`escalates ${label}`, () =>
        Effect.gen(function* () {
          const reviewer = yield* Reviewer
          const result = yield* reviewer.reviewEdit(path)
          expect(result.decision).toBe("require_human")
        }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
    }

    it("approves small edit to safe .ts file", () =>
      Effect.gen(function* () {
        const reviewer = yield* Reviewer
        const result = yield* reviewer.reviewEdit("src/foo.ts", {
          oldString: "const x = 1;",
          newString: "const x = 2;",
        })
        expect(result.decision).toBe("approve")
      }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))

    it("escalates bulk delete of large block", () =>
      Effect.gen(function* () {
        const reviewer = yield* Reviewer
        const result = yield* reviewer.reviewEdit("src/foo.ts", {
          oldString: "const a = 1;\n".repeat(60),
          newString: "",
        })
        expect(result.decision).toBe("require_human")
      }).pipe(Effect.provide(ReviewerLive), Effect.runPromise))
  })
})
