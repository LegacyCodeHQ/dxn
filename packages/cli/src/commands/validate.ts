import { compileDirectory } from "../compiler/compile.js";
import { printDiagnostics, requireProject } from "../project.js";
import { type Context, command } from "./context.js";

export const validateUsage = "Usage: dxn validate [--dir <directory>]\n";

// Compiles the project and reports every diagnostic.
export const validate = command(
  validateUsage,
  (args: string[], { io, cwd, dir }: Context): number => {
    if (args.length > 0) {
      io.stderr(validateUsage);
      return 2;
    }
    const project = requireProject(io, cwd, dir);
    if (project === undefined) {
      return 1;
    }
    const { diagnostics } = compileDirectory(project);
    printDiagnostics(io, project, diagnostics);
    io.stdout(`${JSON.stringify({ project, errors: diagnostics.length })}\n`);
    return diagnostics.length > 0 ? 1 : 0;
  },
);
