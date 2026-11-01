.PHONY: help install fmt fmt-check lint lint-check typecheck references cycles security test coverage grammar zed build smoke check check-fast qa setup-hooks clean

help:
	@echo "Targets:"
	@echo "  install     - Install pinned dependencies from package-lock.json"
	@echo "  fmt         - Format sources with Biome"
	@echo "  fmt-check   - Check formatting with Biome"
	@echo "  lint        - Run Biome lint rules"
	@echo "  lint-check  - Run formatting, lint and type checks"
	@echo "  typecheck   - Type-check both packages' sources and tests"
	@echo "  references  - Fail when a TypeScript package is missing from tsconfig.build.json"
	@echo "  cycles      - Fail on source-file dependency cycles (needs clarity; required in CI)"
	@echo "  security    - Audit production dependencies for known vulnerabilities"
	@echo "  test        - Run both packages' test suites"
	@echo "  coverage    - Run the test suite with coverage thresholds"
	@echo "  grammar     - Check the tree-sitter grammar's generated parser and run its corpus tests"
	@echo "  zed         - Check the Zed extension's grammar commit and queries"
	@echo "  build       - Compile packages/*/src/ to packages/*/dist/, and add dist/main.js"
	@echo "  smoke       - Run every built command, and dist/main.js, once"
	@echo "  check       - Run the full quality gate (the pre-push hook)"
	@echo "  check-fast  - Run the quality gate without coverage"
	@echo "  qa          - Alias for check"
	@echo "  setup-hooks - Activate repository hooks for this clone"
	@echo "  clean       - Remove build and coverage output"

install:
	npm ci

fmt:
	npx biome format --write .

fmt-check:
	npx biome format .

lint:
	npx biome lint .

typecheck:
	npx tsc --noEmit

lint-check:
	npx biome check .
	$(MAKE) typecheck

references:
	node scripts/references/check.mjs

cycles:
	bash scripts/cycles/check.sh

security:
	npm audit --omit=dev --audit-level=moderate

test:
	npx vitest run

coverage:
	npx vitest run --coverage

# The tree-sitter grammar: the committed parser in src/ is the one grammar.js
# generates, and the corpus tests in test/corpus pass.
grammar:
	cd packages/tree-sitter-dxn && \
	  generated="$$(mktemp -d)" && \
	  trap 'rm -rf "$$generated"' EXIT && \
	  npx tree-sitter generate --output "$$generated" && \
	  { diff -r "$$generated" src || { echo "grammar: src/ is stale; run 'npx tree-sitter generate' in packages/tree-sitter-dxn" >&2; exit 1; }; } && \
	  npx tree-sitter test

# The Zed extension: extension.toml pins a commit whose grammar is the one in
# packages/tree-sitter-dxn, and every query compiles against it and the sample
# parses without errors.
zed:
	@commit="$$(sed -n 's/^commit = "\(.*\)"/\1/p' packages/zed/extension.toml)" && \
	  git diff --quiet "$$commit" -- packages/tree-sitter-dxn/grammar.js packages/tree-sitter-dxn/src || \
	  { echo "zed: extension.toml pins a grammar commit that differs from packages/tree-sitter-dxn; update its commit" >&2; exit 1; }
	cd packages/tree-sitter-dxn && \
	  npx tree-sitter parse --quiet ../zed/test/highlight.dxn && \
	  for query in ../zed/languages/dxn/*.scm; do \
	    npx tree-sitter query "$$query" ../zed/test/highlight.dxn > /dev/null || exit 1; \
	  done

# The language, then the dxn command. dist/main.js at the root runs the built
# command, for tooling that runs the CLI from the repository root.
build:
	npx tsc --build tsconfig.build.json
	mkdir -p dist
	cp scripts/root-dist/main.js dist/main.js

# Every command a package declares in its "bin", then the root's dist/main.js.
smoke: build
	node scripts/smoke/run.mjs
	node dist/main.js --version

check: lint-check references cycles security coverage grammar zed smoke

check-fast: lint-check references cycles test grammar zed smoke

qa: check

setup-hooks:
	git config core.hooksPath .githooks

clean:
	rm -rf dist coverage packages/*/dist
