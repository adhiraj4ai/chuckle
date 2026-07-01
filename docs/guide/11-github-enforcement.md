# 11. GitHub enforcement

Add a required CI check so that a pull request cannot merge until the feature it implements has its gating document approved in SignOff.

> Note: The full setup walkthrough, including vault token creation and branch protection rules, is in [docs/github-enforcement.md](../github-enforcement.md). This chapter summarizes the mechanism and the `signoff-ci` CLI, then links you there for the complete step-by-step.

---

## How it works

The local `signoff-gate` hook (run by Claude Code) is a cooperative guardrail — a developer can bypass it. The CI check is the un-bypassable layer. It runs as a GitHub Actions job on every pull request and exits non-zero unless the feature's gating document is approved in the vault.

Which document is required depends on the feature's tier:

| Tier | Required for CI to pass |
|------|------------------------|
| `light` | Spec approved |
| `standard` (default) | Plan approved |
| `heavy` | Plan approved, unanimously |

If the document was approved but the file was later edited, the check re-fails because it verifies the approved content hash. The feature must be re-reviewed and re-approved before the PR can merge.

---

## The `signoff-ci` CLI

`@signoff/ci` provides two subcommands.

### `signoff-ci check`

```
signoff-ci check [--feature <slug>] [--pr-body <text>] [--branch <name>] [--project <dir>]
```

Exits `0` if the feature's gating document is approved; exits `1` if not. Exits `2` if the feature cannot be determined.

| Flag | Env fallback | Description |
|------|-------------|-------------|
| `--feature <slug>` | `SIGNOFF_FEATURE` | Feature slug to check. Takes precedence over all other sources. |
| `--pr-body <text>` | `SIGNOFF_PR_BODY` | PR body text. The command extracts the `Signoff-Feature:` trailer if present. |
| `--branch <name>` | `SIGNOFF_BRANCH`, then `GITHUB_HEAD_REF` | Branch name. Used to infer the feature slug when no explicit value or trailer is found. |
| `--project <dir>` | _(current directory)_ | Project root where `.signoff` is located. |

**Feature resolution order:**

1. `--feature` / `SIGNOFF_FEATURE` (explicit slug)
2. `Signoff-Feature: <slug>` trailer in the PR body
3. Branch name inference (strips leading kind prefixes such as `feat/`, `fix/`, `chore/`; takes the last path segment; lowercases it; rejects generic names like `main`, `develop`)

If none of these yields a valid feature slug, the check exits `2` with an error message instructing you to add the trailer.

### `signoff-ci clone-vault`

```
signoff-ci clone-vault <url> <dest>
```

Clones the vault repository from `<url>` into `<dest>`. If the environment variable `VAULT_TOKEN` is set, it is used as the authentication credential for the clone. This is the step that runs before `signoff-ci check` in the CI workflow.

---

## The reusable GitHub Actions workflow

SignOff ships a reusable workflow at `.github/workflows/signoff-check.yml` in this repository. You call it from your project's workflow file:

```yaml
# .github/workflows/signoff.yml  (in your code repository)
name: SignOff
on:
  pull_request:
jobs:
  signoff:
    uses: adhiraj4ai/signoff/.github/workflows/signoff-check.yml@v1
    with:
      vault_url: https://github.com/your-org/your-project-vault.git
    secrets:
      vault_token: ${{ secrets.VAULT_TOKEN }}
```

The reusable workflow does two things:

1. Runs `npx -y @signoff/ci clone-vault "$VAULT_URL" .signoff` with `VAULT_TOKEN` set, cloning the vault into `.signoff` in the runner workspace.
2. Runs `npx -y @signoff/ci check` with `SIGNOFF_FEATURE`, `SIGNOFF_PR_BODY`, and `SIGNOFF_BRANCH` populated from the workflow inputs and the pull request event.

The workflow accepts an optional `feature` input if you want to hard-code the feature slug rather than rely on inference.

---

## Telling a PR which feature it implements

Add a trailer to the PR body:

```
Signoff-Feature: user-auth
```

Place it on its own line anywhere in the PR description. If you omit the trailer, the check infers the feature from the branch name. For example, a branch named `feat/user-auth` infers the slug `user-auth`. A branch named `main` or `develop` yields no slug and the check exits with an error.

To avoid any ambiguity, add the trailer explicitly.

---

## Making the check required

After your first PR runs the workflow, go to your code repository:

**Settings → Branches → Branch protection rules → edit rule for your default branch → Require status checks to pass before merging**

Search for and add the `SignOff / signoff` status check. With that rule in place, a PR cannot be merged until the check passes.

---

## Full setup guide

For complete instructions — creating the vault token, adding the Actions secret, and wiring up branch protection — see [docs/github-enforcement.md](../github-enforcement.md).

---

## See also

- [Reporting](10-reporting.md) — how to see which features have approved gating documents before a release
- [Feature tiers](06-feature-tiers.md) — how tier controls which document the CI check requires
