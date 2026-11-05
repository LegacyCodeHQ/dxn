import { type Command, command } from "@cli/commands/support/context.js";
import { misused, options, Reporter, read } from "@cli/commands/support/report.js";
import { usage } from "@cli/commands/support/usage.js";
import { printTypeTrees, typeTrees } from "@legacycodehq/dxn-language";

export const treeCommand: Command = command(usage, (args, { io, cwd }) => {
  const { json, rest: arguments_ } = options(args);
  const identifiers = arguments_.includes("--identifiers");
  const [file, selected, ...rest] = arguments_.filter((arg) => arg !== "--identifiers");
  if (
    file === undefined ||
    rest.length > 0 ||
    [file, selected].some((arg) => arg?.startsWith("--"))
  ) {
    return misused(io, json, "give a file and optionally a type");
  }
  const report = new Reporter(io, json, file);
  const parsed = read(file, cwd, report);
  if (typeof parsed === "number") return parsed;
  try {
    const trees = typeTrees(parsed, selected);
    return report.succeed({ file, trees }, printTypeTrees(trees, { identifiers }));
  } catch (error) {
    return report.refuse((error as Error).message);
  }
});
