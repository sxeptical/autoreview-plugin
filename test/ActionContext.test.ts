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
