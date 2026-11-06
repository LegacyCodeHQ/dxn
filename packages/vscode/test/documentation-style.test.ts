import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
const desired = [
  ["dxnDocumentation", false],
  ["dxnDocumentationTag", false],
  ["dxnDocumentationTarget", true],
] as const;

describe("documentation presentation defaults", () => {
  it.each(desired)("gives %s italic styling and the correct emphasis in VS Code", (type, bold) => {
    expect(
      manifest.contributes.configurationDefaults["editor.semanticTokenColorCustomizations"]
        ?.rules?.[`${type}:dxn`],
    ).toMatchObject({ italic: true, bold });
  });
  it.each(desired)("gives %s italic styling and the correct emphasis in Zed", (type, bold) => {
    const rules = JSON.parse(
      readFileSync(join(__dirname, "../../zed/languages/dxn/semantic_token_rules.json"), "utf8"),
    );
    expect(rules.find((rule: { token_type: string }) => rule.token_type === type)).toMatchObject({
      font_style: "italic",
      ...(bold ? {} : { font_weight: "normal" }),
    });
  });
  it.each([
    ["dxnDocumentationTag", ["hint", "comment.doc", "comment"]],
    ["dxnDocumentationTarget", ["dxn.documentation.target", "primary", "punctuation"]],
  ])("uses a subdued tag and normal target palette in Zed: %s", (type, style) => {
    const rules = JSON.parse(
      readFileSync(join(__dirname, "../../zed/languages/dxn/semantic_token_rules.json"), "utf8"),
    );
    expect(rules.find((rule: { token_type: string }) => rule.token_type === type)?.style).toEqual(
      style,
    );
  });
  it("lets Zed inherit medium weight for documentation targets from a dedicated theme entry", () => {
    const rules = JSON.parse(
      readFileSync(join(__dirname, "../../zed/languages/dxn/semantic_token_rules.json"), "utf8"),
    );
    const target = rules.find(
      (rule: { token_type: string }) => rule.token_type === "dxnDocumentationTarget",
    );
    const example = JSON.parse(
      readFileSync(join(__dirname, "../../zed/documentation-medium.settings.json"), "utf8"),
    );
    expect({
      weight: target.font_weight,
      overrides: Object.values(example.theme_overrides).map(
        (theme: unknown) =>
          (theme as { syntax: Record<string, unknown> }).syntax["dxn.documentation.target"],
      ),
    }).toEqual({
      weight: undefined,
      overrides: [
        { font_weight: 500, font_style: "italic" },
        { font_weight: 500, font_style: "italic" },
      ],
    });
  });
  it("keeps the VS Code tag in the muted documentation palette", () => {
    const scopes = manifest.contributes.semanticTokenScopes.find(
      (entry: { language: string }) => entry.language === "dxn",
    );
    const type = manifest.contributes.semanticTokenTypes.find(
      (entry: { id: string }) => entry.id === "dxnDocumentationTag",
    );
    expect({ scopes: scopes.scopes.dxnDocumentationTag, superType: type.superType }).toEqual({
      scopes: ["comment.block.documentation.tag.dxn"],
      superType: "comment",
    });
  });
  it("uses normal text foreground scopes for the target in VS Code", () => {
    const scopes = manifest.contributes.semanticTokenScopes?.find(
      (entry: { language: string }) => entry.language === "dxn",
    );
    expect(scopes?.scopes.dxnDocumentationTarget).toEqual(["source.dxn"]);
  });
});
