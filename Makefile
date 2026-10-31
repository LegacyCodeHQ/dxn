.PHONY: help embed-docs install fmt fmt-check lint lint-check typecheck cycles security test coverage build smoke check check-fast qa setup-hooks clean

help:
	@echo "Targets:"
	@echo "  install     - Install pinned dependencies from package-lock.json"
	@echo "  fmt         - Format sources with Biome"
	@echo "  fmt-check   - Check formatting with Biome"
	@echo "  lint        - Run Biome lint rules"
	@echo "  lint-check  - Run formatting, lint and type checks"
	@echo "  typecheck   - Type-check sources and tests"
	@echo "  cycles      - Fail on source-file dependency cycles (needs clarity; required in CI)"
	@echo "  security    - Audit production dependencies for known vulnerabilities"
	@echo "  test        - Run the test suite"
	@echo "  coverage    - Run the test suite with coverage thresholds"
	@echo "  embed-docs  - Copy docs/workflow.md into the program (after editing it)"
	@echo "  build       - Compile src/ to dist/"
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

embed-docs:
	node scripts/embed-docs/embed.mjs

build:
	npx tsc --project tsconfig.build.json

smoke: build
	node dist/main.js --version

check: lint-check cycles security coverage smoke

check-fast: lint-check cycles test smoke

qa: check

setup-hooks:
	git config core.hooksPath .githooks

clean:
	rm -rf dist coverage
