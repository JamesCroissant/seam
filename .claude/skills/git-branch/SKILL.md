---
name: git-branch
description: Create Git branches and generate branch names that follow the naming rules
argument-hint: [description of the work]
---

# Git branch skill

## Goal
Create the right branch according to the branching strategy.

## Branch types (roles)

| Type | Use for | Branch from | Merge into |
|------|---------|-------------|------------|
| `main` | Production | - | Pull requests only |
| `dev` | Development base | main (initial setup only) | main |
| `feature/` | New features | dev | dev |
| `release/` | Release preparation | dev | main, dev |
| `hotfix/` | Urgent fixes | main | main, dev |

## Naming prefixes

| Prefix | Use for | Example |
|--------|---------|---------|
| `fix/` | Bug fixes | `fix/login-error` |
| `refactor/` | Refactoring | `refactor/api-cleanup` |
| `chore/` | Configuration, dependency updates | `chore/update-dependencies` |
| `docs/` | Documentation | `docs/readme-update` |
| `test/` | Tests | `test/unit-tests` |

## Combinations

### Feature branch + prefix
```
feature/fix/login-bug
feature/refactor/api-structure
feature/docs/user-manual
```

### Prefix only (branched from dev)
```
fix/login-error
refactor/component-structure
chore/update-dependencies
```

### Hotfix branch
```
hotfix/security-patch
hotfix/fix/critical-bug
```

## Workflow

### 1. Classify the work
From the user's description, decide:
- the branch type (feature/hotfix/release)
- the prefix (fix/refactor/chore/docs/test)

### 2. Build the branch name
```
{type}/{prefix}/{description}
```
or
```
{prefix}/{description}
```

### 3. Create the branch
```bash
# Regular feature work
git checkout -b feature/xxx dev

# Bug fix only
git checkout -b fix/xxx dev

# Urgent fix
git checkout -b hotfix/xxx main
```

## Protecting main

### Required settings

- **Enable branch protection** in GitHub:
  - Block direct pushes
  - Require pull requests
  - Require reviews (at least one approval)
  - Require status checks (no merge until CI passes)

### Never

- ❌ Commit directly to `main`
- ❌ Push directly to `main`
- ❌ Merge into `main` without a pull request
- ❌ Create a `feature/` branch from `main`

### Allowed

- ✅ Create `dev` from `main` (initial setup only)
- ✅ Create `hotfix/` from `main` (urgent fixes only)
- ✅ Merge `release/` into `main` (through a reviewed pull request)

## Best practices

- **Clear names**: the name says what the branch is for
- **Keep it small**: one branch, one feature
- **Merge often**: do not keep branches apart for long
- **Review**: always review before merging
- **Clear commit messages**: say what changed
- **Never change main directly**: everything goes through pull requests

## Output
1. Recommended branch name
2. The command to create it
3. Where it merges when the work is done
