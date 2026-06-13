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

  it("matches bare ls (no args)", () => {
    expect(matchSafePattern("ls")?.decision).toBe("approve")
  })

  it("matches bare pwd (no args)", () => {
    expect(matchSafePattern("pwd")?.decision).toBe("approve")
  })

  it("matches bare date (no args)", () => {
    expect(matchSafePattern("date")?.decision).toBe("approve")
  })

  it("matches bare git status", () => {
    expect(matchSafePattern("git status")?.decision).toBe("approve")
  })

  it("matches bare git diff", () => {
    expect(matchSafePattern("git diff")?.decision).toBe("approve")
  })

  it("matches bare git log", () => {
    expect(matchSafePattern("git log")?.decision).toBe("approve")
  })

  it("matches mkdir with -p flag", () => {
    expect(matchSafePattern("mkdir -p foo")?.decision).toBe("approve")
  })

  it("matches node --version", () => {
    expect(matchSafePattern("node --version")?.decision).toBe("approve")
  })

  it("matches npm list", () => {
    expect(matchSafePattern("npm list")?.decision).toBe("approve")
  })

  it("matches npm run typecheck (read-mostly)", () => {
    expect(matchSafePattern("npm run typecheck")?.decision).toBe("approve")
  })

  it("does NOT match python -c (inline code execution)", () => {
    expect(matchSafePattern("python -c 'import os'")).toBeNull()
  })

  it("does NOT match python3 -c (inline code execution)", () => {
    expect(matchSafePattern("python3 -c 'import os'")).toBeNull()
  })

  it("does NOT match node -c (inline code execution)", () => {
    expect(matchSafePattern("node -c 'require(\"fs\")'")).toBeNull()
  })

  it("does NOT match git stash (mutates working tree)", () => {
    expect(matchSafePattern("git stash")).toBeNull()
  })

  it("does NOT match npm run dev (could run anything)", () => {
    expect(matchSafePattern("npm run dev")).toBeNull()
  })

  it("does NOT match npm run start (could run anything)", () => {
    expect(matchSafePattern("npm run start")).toBeNull()
  })
})

