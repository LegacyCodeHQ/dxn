// The stable notebook ID of each kind of problem and refusal, as the Lean
// specification's `ruleId` functions give them. Each ID is written here once;
// the problem types and the code that reports them take it from these tables.

/** Each kind of enumeration problem, and the rule it breaks. */
export const enumRules = {
  badEnumName: "E1",
  empty: "E2",
  badValueName: "E3",
  duplicate: "E4",
} as const;

/** Each kind of problem a file adds, and the rule it breaks. */
export const fileRules = { duplicateEnum: "F1" } as const;

/** Each reason renaming an enumeration is refused, and its ID. */
export const renameRefusals = {
  fileHasProblems: "RE1",
  badEnumName: "RE2",
  noSuchEnum: "RE3",
  enumExists: "RE4",
} as const;

export type EnumRuleId = (typeof enumRules)[keyof typeof enumRules];
export type RuleId = EnumRuleId | (typeof fileRules)[keyof typeof fileRules];
export type RefusalId = (typeof renameRefusals)[keyof typeof renameRefusals];
