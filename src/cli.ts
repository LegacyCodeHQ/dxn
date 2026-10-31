import { actor } from "./commands/actor.js";
import { attach, detach } from "./commands/attach.js";
import { attribute } from "./commands/attribute.js";
import { check } from "./commands/checks.js";
import type { Command } from "./commands/context.js";
import { dimension } from "./commands/dimension.js";
import { expectation } from "./commands/expectation.js";
import { fragment } from "./commands/fragment.js";
import { init } from "./commands/init.js";
import { modifier } from "./commands/modifier.js";
import { node } from "./commands/node.js";
import { override } from "./commands/override.js";
import { profile } from "./commands/profile.js";
import {
  axes,
  contexts,
  evidence,
  show,
  status,
  transitions,
  tree,
  view,
  views,
} from "./commands/reading.js";
import { stateGroup } from "./commands/state-group.js";
import { type } from "./commands/type.js";
import { validate } from "./commands/validate.js";
import { unverify, verify } from "./commands/verify.js";
import { workflow } from "./commands/workflow.js";
import type { Io } from "./io.js";
import { parseGlobal } from "./project.js";
import { version } from "./version.js";

export type { Io } from "./io.js";

const usage = `Usage: dimensions <command> [options]

Project
  workflow            Print the step-by-step guide to building a model; start here
  init                Create a .dimensions project in the working directory
  validate            Compile the project and report every error
  status [<node-id>]  Report each required check as passed, failed or missing

Explore
  tree                Print the roots and fragments
  show <node-id> [<context>...]
                      Show a node's states and values in one context
  contexts <node-id> [<filter>...]
                      List every context a node exists in
  views <node-id>     List every distinct view of a node's subtree: one diagram each
  view <node-id> [<context>...]
                      Print the tree present in one view
  axes <node-id>      List what a view or show of a node accepts
  transitions <node-id>
                      List how a shared node's state changes
  evidence <node-id> --actor <name>
                      List every context of a node and the actor's evidence for it

Record
  verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                      Record a check's result for a node in one context
  unverify <node-id> --check <c> [<context>...]
                      Remove that record
  attach <node-id> --actor <a> --file <path> --frame <id> [<context>...]
                      Record an actor's evidence for a node in one context
  detach <node-id> --actor <a> --frame <id> [<context>...]
                      Remove that evidence

Model
  node <subcommand>   Add, move, rename and remove nodes; say where they exist
  fragment <subcommand>
                      Add, extract and remove reusable fragments
  type <subcommand>   List and add types and states, and set their values
  state-group <subcommand>
                      List and declare groups of states that exclude each other
  attribute <subcommand>
                      List and declare attributes and their values
  check <subcommand>  List and declare checks that types can require
  dimension <subcommand>
                      List and add dimensions, their values, default and scope
  profile <subcommand>
                      List, add and remove the combinations of values that exist
  modifier <subcommand>
                      List, add and remove accessories that change some profiles' values
  override <subcommand>
                      Change states and values for a dimension value or combination
  expectation <subcommand>
                      List, add and remove the rules the model must follow
  actor <subcommand>  List and declare the roles that do work against the model

  help [<command>]    Show this overview, or a command's usage

To build a model, start with "dimensions workflow": it prints the step-by-step
guide as Markdown. Run "dimensions help <command>" (or "dimensions <command>
--help") for a command's options. The docs/ folder of the dimensions package
also explains the concepts, every command, every diagnostic code and the JSON
output.

Options:
  --dir <directory>   Use this project directory instead of the nearest .dimensions
  --dry-run           Print the files a command would write, without writing them
  -h, --help          Show this help
  -V, --version       Print version information as JSON
`;

const commands: Record<string, Command> = {
  workflow,
  init,
  validate,
  show,
  contexts,
  status,
  transitions,
  evidence,
  tree,
  views,
  view,
  axes,
  node,
  type,
  attribute,
  "state-group": stateGroup,
  check,
  fragment,
  dimension,
  profile,
  modifier,
  override,
  expectation,
  actor,
  verify,
  unverify,
  attach,
  detach,
};

export function run(argv: string[], io: Io): number {
  const cwd = io.cwd ?? process.cwd();
  const global = parseGlobal(argv, cwd);
  if ("error" in global) {
    io.stderr(`dimensions: ${global.error}\n\n${usage}`);
    return 2;
  }
  const [first, ...rest] = global.args;
  if (first === undefined || first === "-h" || first === "--help") {
    io.stdout(usage);
    return 0;
  }
  if (first === "-V" || first === "--version") {
    io.stdout(`${JSON.stringify({ version })}\n`);
    return 0;
  }
  if (first === "help") {
    // help <command> [<subcommand>]: the command's usage; help alone: this.
    const [name] = rest.filter((arg) => arg !== "--help" && arg !== "-h");
    if (name === undefined) {
      io.stdout(usage);
      return 0;
    }
    const target = commands[name];
    if (target === undefined) {
      io.stderr(`dimensions: unknown command: ${name}\n\n${usage}`);
      return 2;
    }
    io.stdout(target.usage);
    return 0;
  }
  const command = commands[first];
  if (command === undefined) {
    io.stderr(`dimensions: unknown command: ${first}\n\n${usage}`);
    return 2;
  }
  // --help anywhere after a command prints its usage; no project needed.
  if (rest.includes("--help") || rest.includes("-h")) {
    io.stdout(command.usage);
    return 0;
  }
  return command(rest, { io, cwd, dir: global.dir, dryRun: global.dryRun });
}
