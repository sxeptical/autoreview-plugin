import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { reviewAction } from "./reviewer";
import { applyDecision } from "./approval";
import {
  trackReviewed,
  isReviewed,
  clearReviewed,
  buildBashContext,
  buildEditContext,
} from "./action-hook";

export const AutoReviewPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    "permission.ask": async (permission, output) => {
      if (permission.type === "edit" || permission.type === "external_directory") {
        const decision = reviewAction({
          permission,
          toolName: permission.type,
        });
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
          output.status = applyDecision(decision);
        } else {
          output.status = "allow";
        }
      }
    },

    "tool.execute.before": async (input, output) => {
      const { tool, callID } = input;

      if (tool === "bash" && output.args?.command) {
        const cmd = String(output.args.command);
        const decision = reviewAction(buildBashContext(cmd, callID));

        if (decision.decision === "deny" || decision.decision === "require_human") {
          applyDecision(decision);
          output.args.command = `echo "[auto-review] BLOCKED: ${decision.reason}" && exit 1`;
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

        if (decision.decision === "deny" || decision.decision === "require_human") {
          applyDecision(decision);
          output.args = {
            filePath: output.args.filePath,
            oldString: "",
            newString: "",
          };
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      if (!isReviewed(input.callID)) return;
      clearReviewed(input.callID);

      if (input.tool === "bash") {
        const outputText = String(output.output || "");
        if (outputText.includes("[auto-review] BLOCKED:")) {
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
