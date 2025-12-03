# Git Worktrees Guide

Git worktrees allow you to have multiple branches checked out simultaneously in separate directories, sharing the same `.git` history.

## How Worktrees Work

```
Main repo:     ~/Web/logan-logger-ts/           (branch: main)
Worktree:      ~/.claude-worktrees/logan-logger-ts/some-branch/  (branch: some-branch)
```

Both directories share the same git history, commits, and remote. Changes committed in either location are visible to the other.

## Common Commands

### List all worktrees
```bash
git worktree list
```

### Create a new worktree
```bash
# Create worktree with new branch
git worktree add ../my-feature-branch -b feature/my-feature

# Create worktree from existing branch
git worktree add ../bugfix-branch bugfix/some-fix
```

### Remove a worktree
```bash
# First, cd out of the worktree directory
cd ~/Web/logan-logger-ts

# Remove the worktree
git worktree remove ~/.claude-worktrees/logan-logger-ts/some-branch

# Or force remove if there are changes
git worktree remove --force ~/.claude-worktrees/logan-logger-ts/some-branch
```

### Prune stale worktrees
```bash
# Clean up worktree references for deleted directories
git worktree prune
```

## Workflow: From Worktree to PR

When you've made changes in a worktree and want to create a PR:

### 1. Navigate to the worktree
```bash
cd ~/.claude-worktrees/logan-logger-ts/compassionate-taussig
```

### 2. Check status and stage changes
```bash
git status
git add -A
```

### 3. Commit changes
```bash
git commit -m "fix: disable source maps for JSR to fix browser bundling"
```

### 4. Rename branch (optional, for clarity)
```bash
git branch -m compassionate-taussig fix/disable-source-maps
```

### 5. Push to remote
```bash
git push -u origin fix/disable-source-maps
```

### 6. Create PR
```bash
gh pr create --title "Fix: Disable source maps for JSR" --body "..."
# Or use GitHub web UI
```

### 7. After PR is merged, clean up
```bash
# Go back to main repo
cd ~/Web/logan-logger-ts

# Remove the worktree
git worktree remove ~/.claude-worktrees/logan-logger-ts/compassionate-taussig

# Delete the remote branch (if not auto-deleted)
git push origin --delete fix/disable-source-maps

# Prune any stale references
git worktree prune
```

## Claude Code + Worktrees

Claude Code (Desktop app) may create worktrees automatically in `~/.claude-worktrees/`. These are fully functional git worktrees.

### Tips
- The worktree branch name might be auto-generated (like `compassionate-taussig`)
- Rename it to something meaningful before pushing
- You can cd into the worktree with your regular terminal and work there
- All git commands work normally in a worktree

### Current Worktree Info
To find where you are:
```bash
# Show current worktree path
git rev-parse --show-toplevel

# Show which branch
git branch --show-current

# Show relationship to main repo
git worktree list
```

## Troubleshooting

### "fatal: 'branch-name' is already checked out"
A branch can only be checked out in one worktree at a time. Either:
- Use a different branch name
- Remove the existing worktree first

### Worktree directory was deleted but git still references it
```bash
git worktree prune
```

### Can't delete worktree with uncommitted changes
```bash
git worktree remove --force /path/to/worktree
```

## Worktree Management Tools

These CLI tools make working with git worktrees easier:

### [gwq](https://github.com/d-kuro/gwq) - Git Worktree Manager with Fuzzy Finder
- Fuzzy finder interface (fzf-style)
- Preview branches/commits before selecting
- Tmux session management
- Claude Code integration built-in

```bash
# Install
go install github.com/d-kuro/gwq@latest
```

### [worktree](https://github.com/agenttools/worktree) - By agenttools
- Specifically designed for Claude Code workflows
- GitHub issue integration
- Auto context loading
- Multiple Claude workers on same issue

### [wt](https://github.com/taecontrol/wt) - Simple Worktrees CLI
- Define setup/teardown scripts in a `.wt` file
- Auto-runs `pnpm install`, env setup, etc. when creating worktrees
- Clean interface: `wt add feature-x main`, `wt rm feature-x`

```bash
# Install
go install github.com/taecontrol/wt@latest
```

### [gtr](https://jimmysong.io/en/ai/git-worktree-runner/) - Git Worktree Runner
- Editor integration (VS Code, Cursor, Zed)
- AI tool support (Aider, Claude)
- Cross-platform
- Commands like `gtr new`, `gtr editor`, `gtr ai`
