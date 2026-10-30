#!/usr/bin/env bash
# Fail when the TypeScript source-file graph has a dependency cycle.
# clarity is required in CI (CI set) or when REQUIRE_CLARITY=1; elsewhere a
# missing clarity is reported and skipped so contributors without it can commit.
set -euo pipefail

if ! command -v clarity >/dev/null 2>&1; then
  if [[ -n "${CI:-}" || "${REQUIRE_CLARITY:-}" == 1 ]]; then
    echo "cycles: clarity is required but not installed" >&2
    exit 1
  fi
  echo "cycles: clarity is not installed; skipping the file-cycle check" >&2
  exit 0
fi

report="$(clarity cycles . --code-only --format json)"
count="$(node -e '
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const report = JSON.parse(input);
  if (!("components" in report)) {
    console.error("cycles: clarity JSON has no components field");
    process.exit(1);
  }
  console.log((report.components ?? []).length);
});' <<<"$report")"

if [[ "$count" != 0 ]]; then
  clarity cycles . --code-only
  echo "cycles: $count cyclic component(s); run 'clarity cycles . --code-only --explain'" >&2
  exit 1
fi
echo "cycles: no cyclic components"
