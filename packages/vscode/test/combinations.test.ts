import { showCombinations } from "@vscode/combinations.js";
import { expect, it } from "vitest";

it("asks the server for a fresh table on every activation and displays it verbatim", async () => {
  const requests: unknown[] = [],
    displayed: string[] = [];
  for (const table of [
    "Lamp: 2 combinations\n\n  #  Light\n  1  off\n  2  on",
    "Lamp: 1 combination (varies over nothing)",
  ]) {
    await showCombinations(
      "file:///a.dxn",
      "Lamp",
      async (params) => {
        requests.push(params);
        return { table };
      },
      async (text) => {
        displayed.push(text);
      },
    );
  }
  expect(requests).toEqual(
    Array(2).fill({ command: "dxn.combinations", arguments: ["file:///a.dxn", "Lamp"] }),
  );
  expect(displayed).toHaveLength(2);
  expect(displayed[1]).toBe("Lamp: 1 combination (varies over nothing)");
});

it("does not display a stale table when the current buffer is rejected", async () => {
  let opened = false;
  await expect(
    showCombinations(
      "file:///a.dxn",
      "Lamp",
      async () => {
        throw new Error("file has problems");
      },
      async () => {
        opened = true;
      },
    ),
  ).rejects.toThrow("file has problems");
  expect(opened).toBe(false);
});
