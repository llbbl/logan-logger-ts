# Version Management for logan-logger

This document explains how version management is handled in the logan-logger project. This project uses a centralized version management approach where `package.json` serves as the single source of truth for the package version, eliminating the need to maintain version numbers in multiple configuration files.

## Implementation

```bash
"publish:jsr": "deno publish --set-version ${npm_package_version:-$(npm pkg get version | tr -d '\"')}"
```

## How It Works

### The Problem
- JSR publishing typically requires a version in `jsr.json`
- Deno projects often have versions in `deno.json`
- Maintaining the same version across multiple files is error-prone and redundant

### The Solution
We use shell parameter expansion with a fallback chain:

1. **Primary**: `$npm_package_version` - Available when running via package manager
2. **Fallback**: `$(npm pkg get version | tr -d '\"')` - Direct package.json read

### When Each Method Is Used

**Scenario 1: Running via package manager**
```bash
pnpm run publish:jsr
# npm_package_version is automatically set by pnpm
# Uses the pre-parsed environment variable (faster)
```

**Scenario 2: Running directly**
```bash
deno publish --set-version ${npm_package_version:-$(npm pkg get version | tr -d '\"')}
# npm_package_version is not set
# Falls back to reading package.json directly
```

## Benefits

- **Single source of truth**: Version only maintained in `package.json`
- **No config file duplication**: Removes version from `deno.json` and `jsr.json`
- **Works everywhere**: Functions whether run via package manager or directly
- **Performance optimized**: Uses pre-parsed environment variable when available
- **Error resistant**: No risk of mismatched versions between config files

## Usage

```bash
# Recommended: Run via package manager
pnpm run publish:jsr

# Also works: Direct execution
deno publish --set-version ${npm_package_version:-$(npm pkg get version | tr -d '\"')}
```