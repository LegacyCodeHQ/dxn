import { actor } from "./actor.js";
import { attach, detach } from "./attach.js";
import { attribute } from "./attribute.js";
import { check } from "./checks.js";
import { commandSet } from "./context.js";
import { dimension } from "./dimension.js";
import { expectation } from "./expectation.js";
import { fragment } from "./fragment.js";
import { init } from "./init.js";
import { modifier } from "./modifier.js";
import { node } from "./node.js";
import { override } from "./override.js";
import { profile } from "./profile.js";
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
} from "./reading.js";
import { stateGroup } from "./state-group.js";
import { type } from "./type.js";
import { validate } from "./validate.js";
import { unverify, verify } from "./verify.js";
import { workflow } from "./workflow.js";

// The JSON prototype's commands, run as "dxn prototype <command> ...", kept
// until the prototype is retired.
const usage = `Usage: dxn prototype <command> [options]

Project
  workflow            Print the step-by-step guide to building a model; start here
  init                Create a .dxn project in the working directory
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

To build a model, start with "dxn prototype workflow": it prints the
step-by-step guide as Markdown. Run "dxn prototype help <command>" (or "dxn
prototype <command> --help") for a command's options. The docs/ folder of the
dxn package also explains the concepts, every command, every diagnostic code
and the JSON output.

Options:
  --dir <directory>   Use this project directory instead of the nearest .dxn
  --dry-run           Print the files a command would write, without writing them
  -h, --help          Show this help
  -V, --version       Print version information as JSON
`;

export const prototype = commandSet(usage, {
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
});
