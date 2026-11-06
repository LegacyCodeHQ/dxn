import { isEnumName, isValueName } from "@next/check/names.js";
import { describe, expect, it } from "vitest";

// The naming rules of lean/Dxn/Name.lean, with the cases of lean/DxnTest/Name.lean.

describe("an enumeration name", () => {
  it.each(["Light", "UIState", "HOVER", "Light2", "L"])("accepts %s", (name) => {
    expect(isEnumName(name)).toBe(true);
  });

  it.each(["light", "2Light", "Li-ght", "Li_ght", "", "Lïght", "Éclair"])(
    "rejects '%s'",
    (name) => {
      expect(isEnumName(name)).toBe(false);
    },
  );
});

describe("a value name", () => {
  it.each(["off", "no-keyboard", "19px", "2", "700", "a-1"])("accepts %s", (name) => {
    expect(isValueName(name)).toBe(true);
  });

  it.each(["Off", "a-", "-a", "a--b", "-", "", "no_keyboard", "ön"])("rejects '%s'", (name) => {
    expect(isValueName(name)).toBe(false);
  });
});
