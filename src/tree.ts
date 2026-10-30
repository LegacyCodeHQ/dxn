// The project model: what compileDirectory returns for a valid directory.

// Custom attribute name -> state -> value.
export type CustomAttributeValues = Record<string, Record<string, string>>;

export interface CustomAttributeDeclaration {
  values: string[];
}

export interface TypeDefinition {
  states?: string[];
  customAttributes?: CustomAttributeValues;
}

export interface Task {
  id: string;
  title: string;
  type?: string;
  children?: Task[];
  customAttributes?: CustomAttributeValues;
}

// types.json
export interface TypesFile {
  version: number;
  customAttributes?: Record<string, CustomAttributeDeclaration>;
  types?: Record<string, TypeDefinition>;
}

// tasks/<id>.json
export interface TaskFile {
  version: number;
  task: Task;
}

// dimensions/<name>.json
export interface DimensionFile {
  version: number;
  values: string[];
  appliesTo: string[];
}

export interface Override {
  states?: { add?: string[]; remove?: string[] };
  customAttributes?: CustomAttributeValues;
}

// overrides/<dimension>.json: dimension value -> overrides of types and tasks.
export interface OverridesFile {
  version: number;
  overrides: Record<string, { types?: Record<string, Override>; tasks?: Record<string, Override> }>;
}

// The overrides for one context.
export interface ValueOverrides {
  types?: Record<string, Override>;
  tasks?: Record<string, Override>;
}

// Values of the next dimension -> deeper levels, then ValueOverrides once
// every dimension has a value.
export interface NestedOverrides {
  [value: string]: NestedOverrides | ValueOverrides;
}

// overrides/<a>+<b>.json: overrides for combinations of dimension values,
// nested in the order the file name lists the dimensions.
export interface CombinationOverridesFile {
  version: number;
  overrides: NestedOverrides;
}

export interface VerificationRecord {
  task: string;
  // The state (when the task has states) and a value for every dimension that
  // applies to the task.
  context: Record<string, string>;
  check: string;
  result: "passed" | "failed";
  by: string;
  // ISO 8601 date and time with a time zone.
  at: string;
  evidence?: string;
}

// verification/<root-id>.json: records for tasks in that root task's subtree.
export interface VerificationFile {
  version: number;
  records: VerificationRecord[];
}

export interface Project {
  types: TypesFile;
  // Root tasks, in task file name order.
  tasks: Task[];
  // By dimension name.
  dimensions: Record<string, DimensionFile>;
  overrides: Record<string, OverridesFile>;
  // By file name, e.g. "breakpoint+pointer".
  combinations: Record<string, CombinationOverridesFile>;
  // By root task id.
  verification: Record<string, VerificationFile>;
}

export function findTask(tasks: Task[], id: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === id) {
      return task;
    }
    const found = findTask(task.children ?? [], id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
