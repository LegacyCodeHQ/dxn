import { compileDirectory } from "../compiler/compile.js";
import { checkExpectations } from "../expectations.js";
import { printDiagnostics, requireProject } from "../project.js";
import { Resolver } from "../resolve.js";
import { type Context, command } from "./context.js";

export const validateUsage = "Usage: dimensions validate [--dir <directory>]\n";

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
    const compiled = compileDirectory(project);
    // Expectations are checked against the model, so only once it compiles.
    const diagnostics =
      compiled.project === undefined
        ? compiled.diagnostics
        : checkExpectations(project, new Resolver(compiled.project));
    printDiagnostics(io, project, diagnostics);
    io.stdout(`${JSON.stringify({ project, errors: diagnostics.length })}\n`);
    return diagnostics.length > 0 ? 1 : 0;
  },
);
