import { isEnumName, isValueName } from "@next/check/names.js";

/** Presentation guidance, separate from the Lean acceptance rules. */
export function namingAdvice(
  kind: "badEnumName" | "badValueName",
  name: string,
  taken: ReadonlySet<string>,
): { suggestion?: string; advice: string } {
  let candidate: string;
  if (kind === "badEnumName") {
    // Do not transliterate Unicode or guess how to repair a leading digit.
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return { advice: "" };
    candidate = name
      .split(/[-_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    if (!isEnumName(candidate)) return { advice: "" };
  } else {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return { advice: "" };
    candidate = name
      .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      .replace(/_/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!isValueName(candidate)) return { advice: "" };
  }
  if (taken.has(candidate)) {
    return {
      advice: `; '${candidate}' is already declared ${kind === "badEnumName" ? "in this file" : "in this enumeration"}; choose a distinct name`,
    };
  }
  return { suggestion: candidate, advice: `; use '${candidate}'` };
}
