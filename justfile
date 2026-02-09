# logan-logger - justfile
# Run `just` or `just help` to see available commands

# Default recipe: show help
default:
    @just --list --unsorted

# ============================================================================
# Development
# ============================================================================

# Install dependencies
install:
    pnpm install

# Install dependencies (frozen lockfile, for CI)
install-frozen:
    pnpm install --frozen-lockfile

# Run development version
dev *ARGS:
    bun run src/index.ts {{ ARGS }}

# Run tests (watch mode)
test *ARGS:
    pnpm test {{ ARGS }}

# Run tests once
test-run:
    pnpm test --run

# Run linter (Biome)
lint:
    pnpm lint

# Run type checking
typecheck:
    pnpm typecheck

# Run all checks (lint + typecheck + test)
check: lint typecheck test-run

# CI workflow (install, lint, typecheck, test)
ci: install-frozen lint typecheck test-run

# ============================================================================
# Build
# ============================================================================

# Build library
build:
    pnpm build

# Clean build artifacts
clean:
    rm -rf ./dist

# Clean everything including dependencies
clean-all: clean
    rm -rf ./node_modules

# ============================================================================
# Changelog (git-cliff)
# ============================================================================

# Generate full changelog
changelog:
    git cliff -o CHANGELOG.md

# Preview unreleased changes
changelog-preview:
    git cliff --unreleased

# ============================================================================
# Version Management
# ============================================================================

# Show current version
version:
    @echo "Current version: $(jq -r .version package.json)"

# Show versions in all config files
versions:
    #!/bin/sh
    echo "=== Current Versions ==="
    echo "package.json: $(jq -r '.version' package.json)"
    echo "jsr.json:     $(jq -r '.version // "not set"' jsr.json)"
    echo "deno.json:    $(jq -r '.version // "not set"' deno.json)"

# Sync versions across all config files (uses package.json as source)
version-sync:
    #!/bin/sh
    set -e
    VERSION=$(jq -r '.version' package.json)
    echo "Syncing all configs to version: $VERSION"
    jq --arg v "$VERSION" '.version = $v' jsr.json > jsr.json.tmp && mv jsr.json.tmp jsr.json
    jq --arg v "$VERSION" '.version = $v' deno.json > deno.json.tmp && mv deno.json.tmp deno.json
    echo "Done."

# Internal: update version in all config files
[private]
_update-version version:
    #!/bin/sh
    set -e
    jq --arg v "{{ version }}" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
    jq --arg v "{{ version }}" '.version = $v' jsr.json > jsr.json.tmp && mv jsr.json.tmp jsr.json
    jq --arg v "{{ version }}" '.version = $v' deno.json > deno.json.tmp && mv deno.json.tmp deno.json

# Bump patch version (1.1.13 → 1.1.14)
bump-patch:
    #!/bin/sh
    set -e
    CURRENT=$(jq -r '.version' package.json)
    echo "Current version: $CURRENT"
    MAJOR=$(echo "$CURRENT" | cut -d. -f1)
    MINOR=$(echo "$CURRENT" | cut -d. -f2)
    PATCH=$(echo "$CURRENT" | cut -d. -f3)
    NEW="$MAJOR.$MINOR.$((PATCH + 1))"
    echo "New version: $NEW"
    just _update-version "$NEW"
    git add package.json jsr.json deno.json
    git commit -m "chore(release): bump version to $NEW"
    git tag "v$NEW"
    echo ""
    echo "Created tag v$NEW"
    echo ""
    echo "Push with:"
    echo "  git push origin main --tags"

# Bump minor version (1.1.13 → 1.2.0)
bump-minor:
    #!/bin/sh
    set -e
    CURRENT=$(jq -r '.version' package.json)
    echo "Current version: $CURRENT"
    MAJOR=$(echo "$CURRENT" | cut -d. -f1)
    MINOR=$(echo "$CURRENT" | cut -d. -f2)
    NEW="$MAJOR.$((MINOR + 1)).0"
    echo "New version: $NEW"
    just _update-version "$NEW"
    git add package.json jsr.json deno.json
    git commit -m "chore(release): bump version to $NEW"
    git tag "v$NEW"
    echo ""
    echo "Created tag v$NEW"
    echo ""
    echo "Push with:"
    echo "  git push origin main --tags"

# Bump major version (1.1.13 → 2.0.0)
bump-major:
    #!/bin/sh
    set -e
    CURRENT=$(jq -r '.version' package.json)
    echo "Current version: $CURRENT"
    MAJOR=$(echo "$CURRENT" | cut -d. -f1)
    NEW="$((MAJOR + 1)).0.0"
    echo "New version: $NEW"
    just _update-version "$NEW"
    git add package.json jsr.json deno.json
    git commit -m "chore(release): bump version to $NEW"
    git tag "v$NEW"
    echo ""
    echo "Created tag v$NEW"
    echo ""
    echo "Push with:"
    echo "  git push origin main --tags"

# Release: bump patch, push, and trigger release workflow
release-patch: bump-patch
    git push origin main --tags

# Release: bump minor, push, and trigger release workflow
release-minor: bump-minor
    git push origin main --tags

# Release: bump major, push, and trigger release workflow
release-major: bump-major
    git push origin main --tags
