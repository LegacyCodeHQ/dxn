import { attachCommand } from "@cli/commands/attach.js";
import { casesCommand } from "@cli/commands/cases.js";
import { checkCommand } from "@cli/commands/check.js";
import { fmtCommand } from "@cli/commands/fmt.js";
import { renameCommand } from "@cli/commands/rename.js";
import { reviewCommand } from "@cli/commands/review.js";
import { statesCommand } from "@cli/commands/states.js";
import { statusCommand } from "@cli/commands/status.js";
import type { Command } from "@cli/commands/support/context.js";
import { treeCommand } from "@cli/commands/tree.js";
import { validateCommand } from "@cli/commands/validate.js";

export { commandList } from "@cli/commands/support/usage.js";

// The language's commands, each at the top of dxn.
export const language: Record<string, Command> = {
  check: checkCommand,
  fmt: fmtCommand,
  states: statesCommand,
  tree: treeCommand,
  cases: casesCommand,
  validate: validateCommand,
  rename: renameCommand,
  status: statusCommand,
  attach: attachCommand,
  review: reviewCommand,
};
