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
