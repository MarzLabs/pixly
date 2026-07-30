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
