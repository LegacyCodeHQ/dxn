import { isName } from "../compiler/shape.js";
import { isTimestamp } from "../compiler/verification.js";

// A path from the repository root: parts split by /, none of them empty, . or
// .., and none with a backslash or surrounding spaces, so it names one file
// on every machine and cannot step outside the repository.
function isRelativePath(text: string): boolean {
  return text
    .split("/")
    .every((part) => isName(part) && part !== "." && part !== ".." && !part.includes("\\"));
}

// A built-in type whose values are not listed, only checked. Scalars type a
// record's fields only, so a type's combinations stay finite.
export interface Scalar {
  name: string;
  valid: (text: string) => boolean;
  // What a valid value is, for messages.
  definition: string;
}

export const scalars: Scalar[] = [
  {
    name: "Timestamp",
    valid: isTimestamp,
    definition: "an ISO 8601 date and time with a time zone, e.g. 2026-10-31T08:50:05Z",
  },
  {
    name: "NonEmptyString",
    valid: isName,
    definition: "at least one character, with no spaces at either end and no control characters",
  },
  {
    name: "RelativePath",
    valid: isRelativePath,
    definition:
      "a path from the repository root: parts split by /, none of them empty, . or .., and none with a \\ or spaces at either end",
  },
];

export const scalar = (name: string): Scalar | undefined =>
  scalars.find((candidate) => candidate.name === name);
