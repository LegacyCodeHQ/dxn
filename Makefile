.PHONY: help install fmt lint-check typecheck references boundaries cycles vocabulary brand security test coverage coverage-javascript coverage-zed grammar zed build smoke check check-fast setup-hooks clean

help:
	@echo "Targets:"
	@echo "  install     - Install pinned dependencies from package-lock.json"
	@echo "  fmt         - Format sources with Biome"
	@echo "  lint-check  - Run formatting, lint and type checks"
	@echo "  typecheck   - Type-check all TypeScript packages' sources and tests"
	@echo "  references  - Fail when a TypeScript package is missing from tsconfig.build.json"
	@echo "  boundaries  - Enforce source-layer and public package dependency rules"
	@echo "  cycles      - Fail on source-file dependency cycles (needs clarity; required in CI)"
	@echo "  vocabulary  - Fail on a word of the model written in the CLI or the language server"
	@echo "  brand       - Test the brand tools: the blueprint renderer and brand/brand.json"
	@echo "  security    - Audit production dependencies for known vulnerabilities"
	@echo "  test        - Run every npm workspace's test suite"
	@echo "  coverage    - Report coverage for every npm workspace and the Zed crate"
	@echo "  coverage-javascript - Run Vitest coverage with package thresholds"
	@echo "  coverage-zed - Report native Rust coverage (needs cargo-llvm-cov and LLVM tools)"
	@echo "  grammar     - Check the tree-sitter grammar's generated parser and run its corpus tests"
	@echo "  zed         - Check the Zed extension's grammar commit and queries"
	@echo "  build       - Compile packages/*/src/ to packages/*/dist/, and add dist/main.js"
	@echo "  smoke       - Run every built command, and dist/main.js, once"
	@echo "  check       - Run the full quality gate (the pre-push hook)"
	@echo "  check-fast  - Run the quality gate without coverage"
	@echo "  setup-hooks - Activate repository hooks for this clone"
	@echo "  clean       - Remove build and coverage output"

install:
	npm ci

fmt:
	npx biome format --write .

typecheck:
	npx tsc --noEmit

lint-check:
	npx biome check .
	$(MAKE) typecheck

references:
	node scripts/references/check.mjs

boundaries:
	node --test scripts/boundaries/check.test.mjs
	node scripts/boundaries/check.mjs

cycles:
	bash scripts/cycles/check.sh

# The model's words are said in packages/language, for the dxn command and an
# editor alike: never written in either.
vocabulary:
	node scripts/vocabulary/check.mjs

# The brand tools under brand/: the blueprint renderer, and brand.json, whose
# colors the renderer takes from outside.
brand:
	node --test brand/blueprint/test/

security:
	npm audit --omit=dev --audit-level=moderate

test:
	npx vitest run

coverage: coverage-javascript coverage-zed
	node scripts/test-coverage/summary.mjs

coverage-javascript:
	npx vitest run --coverage

# Override RUST_COVERAGE_COMMAND when using a separately installed tool. Keep the native
# report outside Vitest's output directory, which it cleans on every run.
RUST_COVERAGE_COMMAND ?= cargo llvm-cov

coverage-zed:
	@$(RUST_COVERAGE_COMMAND) --version >/dev/null 2>&1 || \
	  { echo "coverage: install cargo-llvm-cov 0.9.1 and llvm-tools-preview; see README.md" >&2; exit 1; }
	mkdir -p coverage/zed
	cd packages/zed && $(RUST_COVERAGE_COMMAND) --lib --no-report
	cd packages/zed && $(RUST_COVERAGE_COMMAND) report --lcov --output-path ../../coverage/zed/lcov.info
	cd packages/zed && $(RUST_COVERAGE_COMMAND) report --html --output-dir ../../coverage/zed
	cd packages/zed && $(RUST_COVERAGE_COMMAND) report --json --summary-only --output-path ../../coverage/zed/coverage.json

# The tree-sitter grammar: the committed parser in src/ is the one grammar.js
# generates, and the corpus tests in test/corpus pass.
grammar:
	cd packages/tree-sitter-dxn && \
	  generated="$$(mktemp -d)" && \
	  trap 'rm -rf "$$generated"' EXIT && \
	  npx tree-sitter generate --output "$$generated" && \
	  { diff -r -x scanner.c "$$generated" src || { echo "grammar: src/ is stale; run 'npx tree-sitter generate' in packages/tree-sitter-dxn" >&2; exit 1; }; } && \
	  npx tree-sitter test

# The Zed extension: extension.toml pins a commit whose grammar is the one in
# packages/tree-sitter-dxn, and every query compiles against it and the sample
# parses without errors; and its Rust part, which starts the language server,
# is formatted, lint-free, passes its tests, and builds for WebAssembly.
zed:
	@commit="$$(sed -n 's/^commit = "\(.*\)"/\1/p' packages/zed/extension.toml)" && \
	  git diff --quiet "$$commit" -- packages/tree-sitter-dxn/grammar.js packages/tree-sitter-dxn/src || \
	  { echo "zed: extension.toml pins a grammar commit that differs from packages/tree-sitter-dxn; update its commit" >&2; exit 1; }
	cd packages/tree-sitter-dxn && \
	  npx tree-sitter parse --quiet ../zed/test/highlight.dxn && \
	  for query in ../zed/languages/dxn/*.scm; do \
	    npx tree-sitter query "$$query" ../zed/test/highlight.dxn > /dev/null || exit 1; \
	  done
	cd packages/zed && \
	  cargo fmt --check && \
	  cargo clippy --quiet --all-targets -- -D warnings && \
	  cargo test --quiet && \
	  cargo build --quiet --release --target wasm32-wasip2

# The language, then the dxn command. dist/main.js at the root runs the built
# command, for tooling that runs the CLI from the repository root. Then the VS
# Code extension, with the language server bundled into it.
build:
	npx tsc --build tsconfig.build.json
	@for config in packages/*/tsconfig.build.json; do \
	  npx tsc-alias -p "$$config" --no-resolve-package-subpaths || exit 1; \
	done
	mkdir -p dist
	cp scripts/root-dist/main.js dist/main.js
	npm run build --silent --workspace packages/vscode

# Every command a package declares in its "bin", then the root's dist/main.js.
smoke: build
	node scripts/smoke/run.mjs
	node dist/main.js --version

check: lint-check references boundaries cycles vocabulary brand security coverage grammar zed smoke

check-fast: lint-check references boundaries cycles vocabulary brand test grammar zed smoke

setup-hooks:
	git config core.hooksPath .githooks

clean:
	rm -rf dist coverage packages/*/dist
