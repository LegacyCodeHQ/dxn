import { workflow as guide } from "../generated/workflow.js";
import { type Command, command } from "./context.js";

const usage = `Usage: dimensions workflow

Prints the step-by-step guide to building a model, from an empty folder to
verified checks, as Markdown. Needs no project.
`;

export const workflow: Command = command(usage, (args, { io }) => {
  if (args.length > 0) {
    io.stderr(usage);
    return 2;
  }
  io.stdout(guide);
  return 0;
});
