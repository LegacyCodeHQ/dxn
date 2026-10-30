import { readFileSync } from "node:fs";

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

export interface Tree {
  version: number;
  customAttributes?: Record<string, CustomAttributeDeclaration>;
  types?: Record<string, TypeDefinition>;
  tasks: Task[];
}

export function loadTree(path: string): Tree {
  return JSON.parse(readFileSync(path, "utf8")) as Tree;
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

export interface DimensionsFile {
  version: number;
  dimensions: Record<string, { values: string[]; appliesTo: string[] }>;
}

export interface Override {
  states?: { add?: string[]; remove?: string[] };
  customAttributes?: CustomAttributeValues;
}

export interface OverridesFile {
  version: number;
  // Dimension -> value -> overrides of types and tasks in that context.
  overrides: Record<
    string,
    Record<string, { types?: Record<string, Override>; tasks?: Record<string, Override> }>
  >;
}

// A task-tree directory: tree.json plus optional dimensions.json and overrides.json.
export interface Project {
  tree: Tree;
  dimensions?: DimensionsFile;
  overrides?: OverridesFile;
}
