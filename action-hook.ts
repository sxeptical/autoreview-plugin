import type { ActionContext } from "./reviewer";

const REVIEWED_CALLS = new Set<string>();

export function trackReviewed(callID: string): void {
  REVIEWED_CALLS.add(callID);
}

export function isReviewed(callID: string): boolean {
  return REVIEWED_CALLS.has(callID);
}

export function clearReviewed(callID: string): void {
  REVIEWED_CALLS.delete(callID);
}

export function buildBashContext(command: string, callID: string): ActionContext {
  return {
    permission: {
      id: callID,
      type: "bash",
      sessionID: "",
      messageID: "",
      title: "bash command",
      metadata: {},
      time: { created: Date.now() },
    },
    toolName: "bash",
    command,
  };
}

export function buildEditContext(
  filePath: string,
  callID: string,
  args: Record<string, unknown>,
): ActionContext {
  return {
    permission: {
      id: callID,
      type: "edit",
      sessionID: "",
      messageID: "",
      title: "file edit",
      metadata: {},
      time: { created: Date.now() },
      pattern: filePath,
    },
    toolName: "edit",
    args,
  };
}

export function buildExternalDirContext(
  path: string,
  callID: string,
): ActionContext {
  return {
    permission: {
      id: callID,
      type: "external_directory",
      sessionID: "",
      messageID: "",
      title: "external directory access",
      metadata: {},
      time: { created: Date.now() },
      pattern: path,
    },
    toolName: "external_directory",
  };
}
