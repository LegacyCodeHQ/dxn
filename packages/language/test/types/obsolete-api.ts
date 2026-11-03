// Compile-only public API contract; derived fields themselves remain supported.
import type * as language from "../../src/index.js";

// @ts-expect-error The obsolete evidence-tool helper is no longer public.
export type RemovedFieldValue = typeof language.fieldValue;
