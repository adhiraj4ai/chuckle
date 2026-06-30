# Server-side enforcement (GitHub)

The local `signoff-gate` hook is a cooperative guardrail and can be bypassed.
The un-bypassable gate is a required CI check that fails a pull request unless
the feature it implements is cleared for code in the vault. The required
artifact is determined by the feature's tier (light → spec, standard → plan,
heavy → unanimous plan approval).

## Setup

1. **Create a read-only vault token.** A fine-grained PAT with *Contents: Read*
   on the vault repository, or a read-only deploy key. Add it to the **code
   repo** as an Actions secret named `VAULT_TOKEN`.

2. **Add the caller workflow** at `.github/workflows/signoff.yml`:

   ```yaml
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

3. **Tell the PR which feature it implements.** Add a trailer to the PR body:

   ```
   Signoff-Feature: user-auth
   ```

   If omitted, the feature is inferred from the branch name (e.g.
   `feat/user-auth` → `user-auth`).

4. **Make it required.** In the code repo: Settings → Branches → branch
   protection for your default branch → require the **`SignOff / signoff`**
   status check to pass before merging.

Now a PR cannot merge until the feature is cleared for code in SignOff. The
required artifact depends on the feature's tier: light features pass once the
spec is approved; standard features require a plan approval; heavy features
require unanimous plan approval. Editing a document inside the PR re-fails the
check until it is re-approved (the check verifies the approved content hash).

> Requires the `@signoff/ci` package to be available on npm (the workflow runs
> it via `npx`).
