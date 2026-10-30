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

export interface Project {
  types: TypesFile;
  // Root tasks, in task file name order.
  tasks: Task[];
  // By dimension name.
  dimensions: Record<string, DimensionFile>;
  overrides: Record<string, OverridesFile>;
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
