import { attachCommand } from "./attach.js";
import { casesCommand } from "./cases.js";
import { checkCommand } from "./check.js";
import type { Command } from "./context.js";
import { renameCommand } from "./rename.js";
import { statesCommand } from "./states.js";
import { statusCommand } from "./status.js";
import { validateCommand } from "./validate.js";

export { commandList } from "./usage.js";

// The language's commands, each at the top of dxn.
export const language: Record<string, Command> = {
  check: checkCommand,
  states: statesCommand,
  cases: casesCommand,
  validate: validateCommand,
  rename: renameCommand,
  status: statusCommand,
  attach: attachCommand,
};
