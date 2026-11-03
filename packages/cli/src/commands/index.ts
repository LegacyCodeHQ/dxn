import { attachCommand } from "./attach.js";
import { casesCommand } from "./cases.js";
import { checkCommand } from "./check.js";
import { fmtCommand } from "./fmt.js";
import { renameCommand } from "./rename.js";
import { reviewCommand } from "./review.js";
import { statesCommand } from "./states.js";
import { statusCommand } from "./status.js";
import type { Command } from "./support/context.js";
import { validateCommand } from "./validate.js";

export { commandList } from "./support/usage.js";

// The language's commands, each at the top of dxn.
export const language: Record<string, Command> = {
  check: checkCommand,
  fmt: fmtCommand,
  states: statesCommand,
  cases: casesCommand,
  validate: validateCommand,
  rename: renameCommand,
  status: statusCommand,
  attach: attachCommand,
  review: reviewCommand,
};
