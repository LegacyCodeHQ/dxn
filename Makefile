.PHONY: help install fmt fmt-check lint lint-check typecheck cycles security test coverage grammar build smoke check check-fast qa setup-hooks clean

help:
	@echo "Targets:"
	@echo "  install     - Install pinned dependencies from package-lock.json"
	@echo "  fmt         - Format sources with Biome"
	@echo "  fmt-check   - Check formatting with Biome"
	@echo "  lint        - Run Biome lint rules"
	@echo "  lint-check  - Run formatting, lint and type checks"
	@echo "  typecheck   - Type-check both packages' sources and tests"
	@echo "  cycles      - Fail on source-file dependency cycles (needs clarity; required in CI)"
	@echo "  security    - Audit production dependencies for known vulnerabilities"
	@echo "  test        - Run both packages' test suites"
	@echo "  coverage    - Run the test suite with coverage thresholds"
	@echo "  grammar     - Check the tree-sitter grammar's generated parser and run its corpus tests"
	@echo "  build       - Compile packages/*/src/ to packages/*/dist/, and add dist/main.js"
	@echo "  smoke       - Run the built CLI once"
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

# The language, then the dxn command. dist/main.js at the root runs the built
# command, for tooling that runs the CLI from the repository root.
build:
	npx tsc --build tsconfig.build.json
	mkdir -p dist
	cp scripts/root-dist/main.js dist/main.js

smoke: build
	node packages/cli/dist/main.js --version
	node dist/main.js --version

check: lint-check cycles security coverage grammar smoke

check-fast: lint-check cycles test grammar smoke

qa: check

setup-hooks:
	git config core.hooksPath .githooks

clean:
	rm -rf dist coverage packages/*/dist
