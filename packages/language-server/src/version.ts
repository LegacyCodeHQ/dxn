import { readFileSync } from "node:fs";

// package.json sits one level above both src/ (tests) and dist/ (installed server).
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export const version: string = pkg.version;
