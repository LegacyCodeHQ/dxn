import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";

const model = `dimension Pointer = mouse | touch
dimension Theme = light | dark
enum Hover = rest | hovered
enum Actor = design-agent
type Wordmark needs Pointer, Theme {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
record Evidence {
  actor: Actor
}
actor evidence-recorder records Evidence
`;
const profiles = `environment Device = Pointer
profile laptop: Device { Pointer = mouse }
profile phone: Device { Pointer = touch }
`;

// The problems in one stored Evidence record with this context, as
// "code: path: message".
const check = (context: unknown, source = model + profiles) =>
  validate(parse(source), "Evidence", JSON.stringify([{ context, actor: "design-agent" }])).map(
    ({ code, path, message }) => `${code}: ${path}: ${message}`,
  );
const on = (profile: string, theme: string, hover: string) => ({
  type: "Wordmark",
  profile,
  dimensions: { Theme: theme },
  states: { hover },
});

describe("a stored record's context", () => {
  it("names one combination of a type: its profile, the dimensions it does not give, and every state", () => {
    expect([check(on("laptop", "dark", "hovered")), check(on("phone", "light", "rest"))]).toEqual([
      [],
      [],
    ]);
  });

  it("is required, as an object", () => {
    expect([
      validate(parse(model + profiles), "Evidence", '[{ "actor": "design-agent" }]').map(
        ({ code, message }) => `${code}: ${message}`,
      ),
      check("laptop"),
    ]).toEqual([
      ["missing-field: Evidence is missing context"],
      ["wrong-kind: $[0].context: expected a context (an object), found a string"],
    ]);
  });

  it("has a type, a profile, dimensions and states, and nothing else", () => {
    expect([
      check({ type: "Wordmark", profile: "laptop", states: { hover: "rest" } }),
      check({ ...on("laptop", "dark", "rest"), node: "wordmark" }),
    ]).toEqual([
      ["missing-field: $[0].context: context is missing dimensions"],
      [
        'unknown-field: $[0].context.node: context has no field "node" (type, profile, dimensions, states)',
      ],
    ]);
  });

  it("names a type and a profile the file declares", () => {
    expect([
      check({ ...on("laptop", "dark", "rest"), type: "Wordmrk" }),
      check(on("watch", "dark", "rest")),
    ]).toEqual([
      ['unknown-value: $[0].context.type: "Wordmrk" is not a type (Wordmark)'],
      ['unknown-value: $[0].context.profile: "watch" is not a profile (laptop, phone)'],
    ]);
  });

  it("gives each dimension the type needs that the profile does not, and only those", () => {
    expect([
      check({ ...on("laptop", "dark", "rest"), dimensions: {} }),
      check({ ...on("laptop", "dark", "rest"), dimensions: { Theme: "dark", Pointer: "mouse" } }),
      check({ ...on("laptop", "dark", "rest"), dimensions: { Theme: "dim" } }),
    ]).toEqual([
      ["missing-field: $[0].context.dimensions: context.dimensions is missing Theme"],
      [
        "unknown-field: $[0].context.dimensions.Pointer: Pointer is given by the profile; context.dimensions has Theme",
      ],
      ['unknown-value: $[0].context.dimensions.Theme: "dim" is not a value of Theme (light, dark)'],
    ]);
  });

  it("gives every state a value that exists in that combination", () => {
    expect([
      check({ ...on("laptop", "dark", "rest"), states: {} }),
      check({ ...on("laptop", "dark", "rest"), states: { hover: "rest", focus: "blurred" } }),
      check(on("laptop", "dark", "hoverd")),
      check(on("phone", "dark", "hovered")),
    ]).toEqual([
      ["missing-field: $[0].context.states: context.states is missing hover"],
      ['unknown-field: $[0].context.states.focus: Wordmark has no state "focus" (hover)'],
      [
        'unknown-value: $[0].context.states.hover: "hoverd" is not a value of hover (rest, hovered)',
      ],
      [
        'unknown-value: $[0].context.states.hover: "hovered" is not a value of hover on phone, Theme dark (rest)',
      ],
    ]);
  });

  it("gives every dimension the type needs, without a profile, when the file has none", () => {
    expect([
      check(
        {
          type: "Wordmark",
          dimensions: { Pointer: "touch", Theme: "dark" },
          states: { hover: "rest" },
        },
        model,
      ),
      check(
        {
          type: "Wordmark",
          dimensions: { Pointer: "touch", Theme: "dark" },
          states: { hover: "hovered" },
        },
        model,
      ),
      check({ ...on("laptop", "dark", "rest") }, model),
    ]).toEqual([
      [],
      [
        'unknown-value: $[0].context.states.hover: "hovered" is not a value of hover on Pointer touch, Theme dark (rest)',
      ],
      [
        'unknown-field: $[0].context.profile: context has no field "profile" (type, dimensions, states)',
        "missing-field: $[0].context.dimensions: context.dimensions is missing Pointer",
      ],
    ]);
  });

  it("is only on stored records: a nested record has none", () => {
    const source = `${model}${profiles}record Source {\n  actor: Actor\n}\nrecord Review {\n  source: Source\n}\n
actor review-recorder records Review`;
    expect(
      validate(
        parse(source),
        "Review",
        JSON.stringify([
          { context: on("laptop", "dark", "rest"), source: { actor: "design-agent" } },
        ]),
      ),
    ).toEqual([]);
  });
});
