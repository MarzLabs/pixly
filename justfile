# Pixly — recipes for local development.
# Run `just` or `just --list` to see all commands.

set shell := ["bash", "-uc"]

default:
    @just --list

# Install dependencies
install:
    npm install

# Start the Vite dev server (HMR) for the extension
dev:
    npm run dev

# Type-check + production build into dist/
build:
    npm run build

# Type-check only (tsc --noEmit)
typecheck:
    npm run typecheck

# Lint the whole project (0 warnings allowed)
lint:
    npm run lint

# Lint and auto-fix what's fixable
lint-fix:
    npx eslint . --fix

# Format the whole project with Prettier
format:
    npm run format

# Check formatting without writing changes
format-check:
    npm run format:check

# Run the unit test suite once
test:
    npm run test

# Run the unit test suite in watch mode
test-watch:
    npx vitest

# Run a single test file, e.g. `just test-file overlay-geometry`
test-file name:
    npx vitest run {{name}}

# Run typecheck + lint + format-check + test — mirrors CI
check: typecheck lint format-check test

# Auto-fix what tooling can fix: Prettier formatting + ESLint --fix.
# Run this when `check` fails on formatting; `release` deliberately verifies
# rather than rewrites, so a release never silently reformats your tree.
fix: format lint-fix

# Remove build output and caches
clean:
    rm -rf dist .vite coverage
    find . -maxdepth 1 -name '*.tsbuildinfo' -delete

# Full clean including node_modules
clean-all: clean
    rm -rf node_modules

# Build and zip dist/ for distribution (e.g. Chrome Web Store upload)
zip: build
    cd dist && zip -r ../pixly.zip . -x '.*'
    @echo "Created pixly.zip"

# Print the steps to load the unpacked extension in Chrome
load-unpacked: build
    @echo "1. Open chrome://extensions"
    @echo "2. Enable Developer mode (top-right toggle)"
    @echo "3. Click 'Load unpacked' and select the dist/ folder"
    @echo "4. Pin Pixly from the extensions menu"

# Bump package.json/package-lock.json and stage them, no commit.
# Usage: `just bump` (patch), `just bump minor`, `just bump major`, or `just bump 1.2.3`
bump version="patch":
    npm version {{version}} --no-git-tag-version
    git add package.json package-lock.json
    @echo "Bumped to $(node -p "require('./package.json').version") — staged. Run 'just release-commit \"summary\"' or commit manually."

# Build and confirm dist/manifest.json picked up the bumped version
verify-version: build
    @grep '"version"' dist/manifest.json

# Commit a staged version bump with the repo's release message convention.
# summary is optional — omit it for a title-only commit.
release-commit summary="":
    #!/usr/bin/env bash
    set -euo pipefail
    msg="chore(release): Bump version to $(node -p "require('./package.json').version")"
    if [ -n "{{summary}}" ]; then
      git commit -m "$msg" -m "{{summary}}"
    else
      git commit -m "$msg"
    fi

# Tag HEAD with the current package.json version (vX.Y.Z)
tag-release:
    git tag "v$(node -p "require('./package.json').version")"

# Full release flow: verify, bump, confirm the build, commit, and tag. Push is left to you.
# Usage: just release minor, or just release minor "Summary of what changed since last release"
release version summary="": check
    just bump {{version}}
    just verify-version
    just release-commit "{{summary}}"
    just tag-release
    @echo "Committed and tagged locally. Run 'just push-release' to publish to origin."

# Push main and its tags to origin
push-release:
    git push origin main --tags
