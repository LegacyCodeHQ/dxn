import type { Command } from "./context.js";
import { editCommand, group, parse, Refusal, requireNode, UsageError } from "./edit.js";

const usage = `Usage: dimensions fragment <subcommand>

Subcommands:
  add <id> --title <title>           Add a reusable fragment in fragments/<id>.json
  extract <node-id>                  Move a node's subtree into a fragment, included in its place
  remove <id>                        Remove a fragment
`;

const add = editCommand(usage, (workspace, args) => {
  const { values, positionals } = parse(args, ["id"], { title: { type: "string" } });
  const [id] = positionals as [string];
  if (values.title === undefined) {
    throw new UsageError("--title is required");
  }
  const file = `fragments/${id}.json`;
  if (workspace.exists(file)) {
    throw new Refusal(`fragment "${id}" already exists`);
  }
  workspace.write(file, { version: 1, fragment: { id, title: values.title } });
});

const extract = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["node-id"], {}).positionals as [string];
  const located = requireNode(workspace, id);
  if (located.siblings === undefined) {
    throw new Refusal(
      `"${id}" is the top node of its file; only a node inside one can be extracted`,
    );
  }
  const file = `fragments/${id}.json`;
  if (workspace.exists(file)) {
    throw new Refusal(`fragment "${id}" already exists`);
  }
  located.siblings[located.siblings.indexOf(located.item)] = { include: id };
  workspace.touch(located.file);
  workspace.write(file, { version: 1, fragment: located.item });
});

const remove = editCommand(usage, (workspace, args) => {
  const [id] = parse(args, ["id"], {}).positionals as [string];
  const file = `fragments/${id}.json`;
  if (!workspace.exists(file)) {
    throw new Refusal(`fragment not found: ${id}`);
  }
  workspace.remove(file);
});

export const fragment: Command = group(usage, { add, extract, remove });
