# Auto-Publishing Setup for npm and JSR

This setup enables automatic publishing of your package to both npm and JSR registries when the package version changes on the main branch.

## How It Works

The workflow triggers when:
1. A commit is pushed to the `main` branch
2. The `package.json` file was modified in that commit
3. The version number in `package.json` actually changed from the previous commit

This means you can push directly to main without triggering publishes - it only publishes when you bump the version.

## Quick Setup

1. Ensure the GitHub Actions workflow is in place: `.github/workflows/publish.yml`
2. Configure your repository secrets (see below)
3. Bump version and push to trigger publishing

## Repository Secrets

Add these secrets in GitHub → Settings → Secrets and variables → Actions:

### NPM_TOKEN
1. Go to [npm tokens page](https://www.npmjs.com/settings/tokens)
2. Click "Generate New Token" → "Automation"
3. Copy the token and add as `NPM_TOKEN` secret

### JSR_TOKEN
1. Go to [JSR tokens page](https://jsr.io/account/tokens)
2. Create a new token with publish permissions
3. Copy the token and add as `JSR_TOKEN` secret

## Publishing Process

### Standard Workflow
```bash
# Bump version (patch/minor/major)
pnpm version patch

# Push to main branch (can be direct push or PR merge)
git push origin main

# Workflow automatically detects version change and publishes
```

### Alternative: PR-based
```bash
# In a feature branch
pnpm version patch
git add package.json
git commit -m "Bump version to 1.1.7"
git push origin feature-branch

# Create and merge PR to main
# Workflow triggers on merge and publishes
```

## Workflow Features

- ✅ Version change detection (no accidental publishes)
- ✅ Quality checks (typecheck, lint, test) before publishing
- ✅ Builds package using `pnpm build`
- ✅ Publishes to both npm (`logan-logger`) and JSR (`@logan/logger`)
- ✅ Auto-syncs JSR version with package.json
- ✅ Creates git tags for published versions
- ✅ Uses `pnpm` as specified in project requirements

## Configuration Details

### Package.json
Already configured with:
- Proper exports for multiple entry points (node, browser, deno, bun)
- Public access for npm publishing
- Build scripts using pnpm

### JSR.json
Already configured with:
- Scoped name `@logan/logger`
- Proper exports and includes
- Version will be auto-synced from package.json

## Workflow Behavior

**Direct Push to Main**: Safe - only publishes if version changed
```bash
git push origin main  # No publish (version unchanged)
```

**Version Bump Push**: Triggers publish
```bash
pnpm version patch
git push origin main  # Publishes new version
```

**Non-version Changes**: Safe - no publish triggered
```bash
# Edit README, add features, fix bugs
git push origin main  # No publish (version unchanged)
```

## Troubleshooting

### JSR Publishing Issues
- Package publishes to `@logan/logger` (scoped name required)
- Version auto-synced from package.json
- Uses built files from `dist/` directory

### npm Publishing Issues
- Package publishes as `logan-logger`
- Uses `--no-git-checks` flag for automation
- Requires `NPM_TOKEN` with publish permissions

### Version Detection Issues
```bash
# Check if version actually changed
git log -1 --name-only  # Should show package.json if version bumped
git diff HEAD~1 HEAD package.json  # Should show version change
```

### Common Fixes
```bash
# Test version detection locally
current_version=$(node -p "require('./package.json').version")
echo "Current version: $current_version"

# Test build process
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Security Notes

- Tokens stored as encrypted GitHub secrets
- Workflow uses minimal required permissions
- No tokens exposed in logs
- Version detection prevents accidental publishes

## Manual Override

If you need to publish without version change:
```bash
# Remove version check condition temporarily in workflow
# Or create a manual workflow dispatch trigger
```

For issues with publishing, check the Actions tab in your GitHub repository for detailed logs.