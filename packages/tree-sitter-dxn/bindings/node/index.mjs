import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import load from "node-gyp-build";

const require = createRequire(import.meta.url);
const language = load(fileURLToPath(new URL("../..", import.meta.url)));
language.nodeTypeInfo = require("../../src/node-types.json");
export default language;
