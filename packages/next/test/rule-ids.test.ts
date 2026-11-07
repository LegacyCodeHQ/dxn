import { checkEnum, checkFile, renameEnum } from "@next/index.js";
import { expect, it } from "vitest";

const span = { start: 0, end: 0 };
const declaration = (name: string, values: string[]) => ({
  name: { text: name, span },
  values: values.map((text) => ({ text, span })),
  span,
});
it("carries notebook IDs on core problems before presentation", () => {
  expect(checkEnum(declaration("light", ["Off", "Off"])).map((p) => p.rule)).toEqual([
    "E1",
    "E3",
    "E4",
  ]);
  expect(checkEnum(declaration("Light", []))[0]).toHaveProperty("rule", "E2");
  expect(
    checkFile([declaration("Light", ["Off"]), declaration("Light", ["off"])]).map((p) => p.rule),
  ).toEqual(["E3", "F1"]);
});
it.each([
  ["enum Light {}", "Light", "Lamp", ["RE1"]],
  ["enum Light { off }", "Light", "lamp", ["RE2"]],
  ["enum Light { off }", "Missing", "Lamp", ["RE3"]],
  ["enum Light { off } enum Power { on }", "Light", "Power", ["RE4"]],
  ["enum Light { off } enum Power { on }", "Missing", "Power", ["RE3", "RE4"]],
] as const)("carries refusal IDs for %s: %s to %s", (source, from, to, ids) => {
  expect(renameEnum(source, from, to).refusals.map((p) => p.rule)).toEqual(ids);
});
