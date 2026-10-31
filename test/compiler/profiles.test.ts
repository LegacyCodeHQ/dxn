import { afterAll, describe, expect, it } from "vitest";
import { at, cleanup, diagnose, type Files, rootFile } from "../support/project.js";

afterAll(cleanup);

const project = (profiles: unknown, extra: Files = {}): Files => ({
  "types.json": {
    version: 1,
    checks: { visual: {} },
    types: { link: { states: ["rest", "hovered"], checks: ["visual"] } },
  },
  "roots/page.json": rootFile({
    id: "page",
    title: "Page",
    children: [{ id: "link", title: "Link", type: "link" }],
  }),
  "dimensions/breakpoint.json": { version: 1, values: ["sm", "lg"], appliesTo: ["page"] },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["page"] },
  "profiles.json": { version: 1, profiles },
  ...extra,
});

const phone = { breakpoint: "sm", pointer: "touch" };
const laptop = { breakpoint: "lg", pointer: "mouse" };
const p = at("profiles.json");

describe("profiles.json", () => {
  it("names one value for each dimension it covers", () => {
    expect(diagnose(project({ phone, laptop }))).toEqual([]);
  });

  it("names declared dimensions and their values", () => {
    expect([
      diagnose(
        project({ phone: { ...phone, theme: "dark" }, laptop: { ...laptop, theme: "dark" } }),
      ),
      diagnose(project({ phone: { ...phone, pointer: "pen" }, laptop })),
      diagnose(project({ phone: {}, laptop })),
    ]).toEqual([
      [
        p("undeclared-dimension", "$.profiles.phone.theme"),
        p("undeclared-dimension", "$.profiles.laptop.theme"),
      ],
      [p("unknown-dimension-value", "$.profiles.phone.pointer")],
      [p("empty-values", "$.profiles.phone")],
    ]);
  });

  it("gives every profile the same dimensions", () => {
    expect(diagnose(project({ phone, laptop: { breakpoint: "lg" } }))).toEqual([
      p("incomplete-profile", "$.profiles.laptop"),
    ]);
  });

  it("never names one combination twice", () => {
    expect(diagnose(project({ phone, laptop, ipad: { ...phone } }))).toEqual([
      p("duplicate-profile", "$.profiles.ipad"),
    ]);
  });

  it("leaves no default on a dimension it covers", () => {
    expect(
      diagnose(
        project(
          { phone, laptop },
          {
            "dimensions/pointer.json": {
              version: 1,
              values: ["mouse", "touch"],
              default: "mouse",
              appliesTo: ["page"],
            },
          },
        ),
      ),
    ).toEqual([at("dimensions/pointer.json")("profiled-default", "$.default")]);
  });

  it("keeps the name profile for itself", () => {
    expect(
      diagnose(
        project(
          { phone, laptop },
          { "dimensions/profile.json": { version: 1, values: ["a"], appliesTo: ["page"] } },
        ),
      ),
    ).toEqual([{ file: "dimensions/profile.json", code: "reserved-name", path: "$" }]);
  });

  it("has the expected shape", () => {
    expect([
      diagnose({ ...project({}), "profiles.json": { version: 1 } }),
      diagnose({ ...project({}), "profiles.json": { version: 1, profiles: {}, extra: 1 } }),
      diagnose(project({ phone: { breakpoint: 1 } })),
    ]).toEqual([
      [p("missing-key", "$.profiles")],
      [p("unknown-key", "$.extra")],
      [p("wrong-type", "$.profiles.phone.breakpoint")],
    ]);
  });
});

describe("records under profiles", () => {
  const record = (context: Record<string, string>) => ({
    "verification/page.json": {
      version: 1,
      records: [
        {
          node: "link",
          context,
          check: "visual",
          result: "passed",
          by: "p",
          at: "2026-10-31T10:00:00Z",
        },
      ],
    },
  });
  const v = at("verification/page.json");

  it("name a combination some profile has", () => {
    expect([
      diagnose(project({ phone, laptop }, record({ ...laptop, state: "rest" }))),
      diagnose(
        project({ phone, laptop }, record({ breakpoint: "lg", pointer: "touch", state: "rest" })),
      ),
    ]).toEqual([[], [v("no-profile", "$.records[0].context")]]);
  });

  it("name every dimension a profile covers, since none has a default", () => {
    expect(
      diagnose(project({ phone, laptop }, record({ breakpoint: "lg", state: "rest" }))),
    ).toEqual([v("missing-key", "$.records[0].context.pointer")]);
  });
});
