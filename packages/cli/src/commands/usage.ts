// The commands, as the overview and each command's usage list them.
export const commandList = `  check <file> [--expect <title>]    Parse and check a file; say what it declares,
                                     or report every problem it has. Warnings
                                     are printed, but do not fail. With
                                     --expect, run only the expectation with
                                     that title, and say whether it holds
  fmt <file>... [--check]            Write each file the one way a .dxn file is
                                     written, and name the files changed; with
                                     --check, write nothing, name the files not
                                     written that way, and fail if there are any
  states <file> <type>               Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions it needs,
                                     as a Markdown table; or a child in place,
                                     given its path from a type, such as
                                     Toolbar.menu.toggle: where it is inside its
                                     parents, with the states they give it
  cases <file> <type>                List the cases a type, or a child in place,
        [--combinations]             has: those that can be told apart, each
                                     with what it covers where it covers more
                                     than one combination; with --combinations,
                                     every combination, as if nothing were
                                     alike
  validate <file>                    Check the stored records: each record's data is
                                     every JSON file in a folder named after it in
                                     kebab-case, next to the file, each a list of
                                     records with every field given, each of its
                                     type, and no others. Print what it checked, or
                                     every problem with its line, column and path
  attach <file> <path> --actor <name> --data <json> <key>=<value>...
                                     Record, as the actor, the record it records,
                                     for each combination the context's keys give
                                     (a|b lists several) that exists in place:
                                     --data gives its fields as JSON, and each
                                     PenNode's fingerprint is taken now, of its
                                     node or else its frame; an entry for the same
                                     combination, actor and data is replaced; with
                                     --dry-run, say what it would write
  status <file> [--missing]          Count, for each record an actor records, the
                                     combinations of every element in the file's
                                     trees, in place, and those a stored record is
                                     about; with --missing, list the others
  review <file>                      Write, for each tree and each record with a
                                     PenNode, a Markdown page of its combinations,
                                     each with its status and the picture of what
                                     was recorded, pictures/<node>.png beside the
                                     page; pages go in dxn's cache, outside the
                                     repository, and are named as they are written
  rename <file> <name> <new>         Rename a declaration where the file uses it
                                     and where stored records name it, once both
                                     check: <name> as dxn writes it (Hover,
                                     Hover.rest, Toolbar.layout, Phone, ...;
                                     <kind>:<name> where one name names two), or
                                     <file>:<line>:<column> <new> by its place; a
                                     record's stored records move to the folder of
                                     its new name; with --dry-run, say what it
                                     would write`;

export const usage = `Usage: dxn <command> <file> [options]

dxn, the language of design and dimensions, which grows one concept at a
time: see docs/language/guide.md. A .dxn file declares enums, each a named
set of values; dimensions, each listing the values the environment varies
by; types with the dimensions they need, their states, rules for when a
state's value exists, a when for a state the world decides, and the
children they have; environments, each a product of dimensions; profiles,
each an instance of an environment; modifiers, accessories that change
some profiles; records, each a named group of typed fields; and
expectations, rules checked against the tree in place. A # starts a
comment, to the end of the line:

  # The wordmark's hover only exists with a mouse.
  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark needs Pointer {
    state hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile Laptop: Device { Pointer = mouse }

Commands:
${commandList}

Options:
  --json                             Print one JSON document, for tools: the result
                                     and any warnings as "problems"; on a failure,
                                     the file and its problems; on a refusal or
                                     a usage error, {"error": "<message>"}, with
                                     any problems found before a refusal
`;
