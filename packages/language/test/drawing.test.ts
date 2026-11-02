import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Fingerprints } from "../src/fingerprint.js";
import { parse } from "../src/parse.js";
import { validate } from "../src/validate.js";

// A design with a back button, a bar that holds one and hides it on a root
// screen, a row, and a screen frame of each: one with rows, one with a
// button where they would be.
const design = {
  children: [
    { id: "back", type: "frame", name: "BackButton", reusable: true, children: [] },
    {
      id: "bar",
      type: "frame",
      name: "NavigationBar",
      reusable: true,
      children: [{ id: "bar-back", type: "ref", ref: "back" }],
    },
    { id: "row", type: "frame", name: "ArticleRow", reusable: true, children: [] },
    { id: "icon", type: "frame", name: "Icon", reusable: true, children: [] },
    {
      id: "states",
      type: "frame",
      children: [
        { id: "pushed", type: "ref", ref: "bar" },
        { id: "root", type: "ref", ref: "bar", descendants: { "bar-back": { enabled: false } } },
        {
          id: "articles",
          type: "frame",
          children: [
            { id: "nav", type: "ref", ref: "bar", descendants: { "bar-back": { enabled: false } } },
            {
              id: "list",
              type: "frame",
              children: [
                { id: "r1", type: "ref", ref: "row" },
                { id: "r2", type: "ref", ref: "row" },
                { id: "r3", type: "ref", ref: "row", enabled: false },
                { id: "i1", type: "ref", ref: "icon" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const folder = mkdtempSync(join(tmpdir(), "dxn-drawing-"));
const path = join(folder, "design.pen");
writeFileSync(path, JSON.stringify(design));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("what a drawing shows", () => {
  const prints = new Fingerprints();
  const shown = (node: string) => Object.fromEntries(prints.instances(path, node) ?? []);

  it("is the components it has an instance of, by name, each counted, not what they hold", () => {
    expect(shown("articles")).toEqual({ NavigationBar: 1, ArticleRow: 2, Icon: 1 });
  });

  it("is, for an instance, what its component holds, without what the instance hides", () => {
    expect([shown("pushed"), shown("root")]).toEqual([{ BackButton: 1 }, {}]);
  });

  it("is nothing known for a node the file does not have", () => {
    expect(prints.instances(path, "nowhere")).toBeUndefined();
  });
});

describe("a drawing against the model", () => {
  const file = parse(`enum Kind = root | pushed
enum Content = articles | empty
type BackButton {}
type NavigationBar {
  state kind: Kind
  has back: BackButton only when kind = pushed
}
type ArticleRow {}
type FeedScreen {
  state content: Content
  has navigation: NavigationBar { kind = root }
  has article: ArticleRow only when content = articles
}
type ListScreen {
  state content: Content
  has navigation: NavigationBar { kind = root }
  has articles: [ArticleRow] only when content = articles
}
record Evidence {
  source: PenNode
}
actor DesignAgent records Evidence
`);
  const entry = (type: string, states: Record<string, string>, node: string) => ({
    context: { type, dimensions: {}, states },
    actor: "DesignAgent",
    source: { file: "design.pen", frame: "states", node, fingerprint: "a1" },
  });
  const prints = new Fingerprints();
  const drawn = ({ file: drawing, node, frame }: { file: string; frame: string; node?: string }) =>
    prints.instances(join(folder, drawing), node ?? frame);
  // Each problem, with where in the model it is about.
  const problems = (...entries: ReturnType<typeof entry>[]) =>
    validate(file, "Evidence", JSON.stringify(entries), drawn).map(
      ({ code, message, element }) => `${element?.line}:${element?.column}: ${code}: ${message}`,
    );

  it("agrees where each child is drawn as often as the model has it", () => {
    expect(
      problems(
        entry("NavigationBar", { kind: "pushed" }, "pushed"),
        entry("NavigationBar", { kind: "root" }, "root"),
        entry("ListScreen", { content: "articles" }, "articles"),
      ),
    ).toEqual([]);
  });

  it("is an error, at the child, where it is drawn more often than the model has it", () => {
    expect(problems(entry("FeedScreen", { content: "articles" }, "articles"))).toEqual([
      "12:7: drawing-mismatch: content = articles: the drawing shows 2 ArticleRow instances, but article is a single ArticleRow; make it a list, [ArticleRow], or draw one",
    ]);
  });

  it("is an error, at the child, where it is drawn in a look it is not there in", () => {
    expect(problems(entry("NavigationBar", { kind: "root" }, "pushed"))).toEqual([
      "6:7: drawing-mismatch: kind = root: the drawing shows 1 BackButton instance, but back is there only when kind = pushed",
    ]);
  });

  it("is an error, at the child, where it is not drawn", () => {
    expect(problems(entry("NavigationBar", { kind: "pushed" }, "root"))).toEqual([
      "6:7: drawing-mismatch: kind = pushed: the drawing shows no BackButton instance, but back is a single BackButton",
    ]);
  });

  it("is an error, at the list, where it is not drawn", () => {
    expect(problems(entry("ListScreen", { content: "articles" }, "pushed"))).toEqual([
      "14:6: drawing-mismatch: content = articles: the drawing shows 1 BackButton instance, which ListScreen does not have",
      "16:7: drawing-mismatch: content = articles: the drawing shows no NavigationBar instance, but navigation is a single NavigationBar",
      "17:7: drawing-mismatch: content = articles: the drawing shows no ArticleRow instance, but articles is a list, one or more ArticleRow",
    ]);
  });

  it("is an error, at the type, where a component of the model is drawn that it does not have", () => {
    expect(problems(entry("NavigationBar", { kind: "pushed" }, "articles"))).toEqual([
      "4:6: drawing-mismatch: kind = pushed: the drawing shows 1 NavigationBar instance, which NavigationBar does not have",
      "4:6: drawing-mismatch: kind = pushed: the drawing shows 2 ArticleRow instances, which NavigationBar does not have",
      "6:7: drawing-mismatch: kind = pushed: the drawing shows no BackButton instance, but back is a single BackButton",
    ]);
  });

  it("is not checked without a way to read drawings", () => {
    const entries = [entry("FeedScreen", { content: "articles" }, "articles")];
    expect(validate(file, "Evidence", JSON.stringify(entries))).toEqual([]);
  });
});
