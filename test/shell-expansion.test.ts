import { describe, it, expect } from "vitest"
import { matchShellExpansionPattern } from "../src/rules/shell-expansion.js"

describe("Shell Expansion Patterns", () => {
  it("catches $() command substitution", () => {
    const result = matchShellExpansionPattern('echo "$(rm -rf important-folder)"')
    expect(result?.decision).toBe("require_human")
  })

  it("catches backtick command substitution", () => {
    const result = matchShellExpansionPattern("ls `rm -rf temp-folder`")
    expect(result?.decision).toBe("require_human")
  })

  it("catches logical OR chain", () => {
    const result = matchShellExpansionPattern("false || rm -rf /")
    expect(result?.decision).toBe("require_human")
  })

  it("catches embedded newlines", () => {
    const result = matchShellExpansionPattern("echo safe\nrm -rf /")
    expect(result?.decision).toBe("require_human")
  })

  it("catches redirection into pipe", () => {
    const result = matchShellExpansionPattern("cmd 2>&1 | grep foo")
    expect(result?.decision).toBe("require_human")
  })

  it("catches process substitution", () => {
    const result = matchShellExpansionPattern("diff <(rm -rf a) <(rm -rf b)")
    expect(result?.decision).toBe("require_human")
  })

  it("catches sh -c", () => {
    const result = matchShellExpansionPattern('sh -c "rm -rf /"')
    expect(result?.decision).toBe("require_human")
  })

  it("catches bash -c", () => {
    const result = matchShellExpansionPattern('bash -c "rm -rf /"')
    expect(result?.decision).toBe("require_human")
  })

  it("catches zsh -c", () => {
    const result = matchShellExpansionPattern('zsh -c "rm -rf $HOME"')
    expect(result?.decision).toBe("require_human")
  })

  it("catches eval", () => {
    const result = matchShellExpansionPattern('eval "rm -rf /"')
    expect(result?.decision).toBe("require_human")
  })

  it("catches exec", () => {
    const result = matchShellExpansionPattern("exec rm -rf /")
    expect(result?.decision).toBe("require_human")
  })

  it("catches source", () => {
    const result = matchShellExpansionPattern("source ./malicious.sh")
    expect(result?.decision).toBe("require_human")
  })

  it("returns null for plain commands", () => {
    expect(matchShellExpansionPattern("ls -la")).toBeNull()
    expect(matchShellExpansionPattern("rm -rf /tmp/foo")).toBeNull()
  })
})
