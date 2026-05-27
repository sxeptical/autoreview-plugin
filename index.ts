import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { reviewAction } from "./reviewer";
import { applyDecision } from "./approval";
import {
  trackReviewed,
  isReviewed,
  clearReviewed,
  trackReviewedDecision,
  getReviewedDecision,
  clearReviewedDecision,
  buildBashContext,
  buildEditContext,
} from "./action-hook";

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  const permissionCallID = (permission: { id: string; callID?: string }) => permission.callID ?? permission.id;

  return {
    "permission.ask": async (permission, output) => {
      if (permission.type === "edit" || permission.type === "external_directory") {
        const decision = reviewAction({
          permission,
          toolName: permission.type,
        });
        trackReviewedDecision(permissionCallID(permission), decision.decision);
        output.status = applyDecision(decision);
        return;
      }

      if (permission.type === "bash") {
        const cmd = typeof permission.pattern === "string"
          ? permission.pattern
          : Array.isArray(permission.pattern)
            ? permission.pattern[0]
            : undefined;

        if (cmd && cmd !== "*") {
          const decision = reviewAction(buildBashContext(cmd, permission.id));
          trackReviewedDecision(permissionCallID(permission), decision.decision);
          output.status = applyDecision(decision);
          return;
        }

        // If OpenCode only provides wildcard pattern during permission check,
        // force a human gate and let runtime check inspect the exact command.
        trackReviewedDecision(permissionCallID(permission), "require_human");
        output.status = "ask";
      }
    },

    "tool.execute.before": async (input, output) => {
      const { tool, callID } = input;

      if (tool === "bash" && output.args?.command) {
        const cmd = String(output.args.command);
        const decision = reviewAction(buildBashContext(cmd, callID));
        const preReviewedDecision = getReviewedDecision(callID);

        if (decision.decision === "deny") {
          throw new Error(`auto-review blocked command: ${decision.reason}`);
        } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
          throw new Error(`auto-review requires manual approval: ${decision.reason}`);
        }

        trackReviewed(callID);
        return;
      }

      if (tool === "edit" && output.args?.filePath) {
        const decision = reviewAction(buildEditContext(
          String(output.args.filePath),
          callID,
          output.args,
        ));
        const preReviewedDecision = getReviewedDecision(callID);

        if (decision.decision === "deny") {
          throw new Error(`auto-review blocked edit: ${decision.reason}`);
        } else if (decision.decision === "require_human" && preReviewedDecision !== "require_human") {
          throw new Error(`auto-review requires manual approval: ${decision.reason}`);
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      clearReviewedDecision(input.callID);
      if (!isReviewed(input.callID)) return;
      clearReviewed(input.callID);

      if (input.tool === "bash") {
        const outputText = String(output.output || "");
        if (outputText === "") {
          output.title = "auto-review: command blocked";
        }
      }

      if (input.tool === "edit") {
        const outputText = String(output.output || "");
        if (outputText === "") {
          output.title = "auto-review: edit blocked";
        }
      }
    },
  } satisfies Hooks;
};
