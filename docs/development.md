# Development

```bash
git clone https://github.com/robertxxiv/fjordbook-mcp.git
cd fjordbook-mcp
pnpm install       # install dependencies (also sets up the git hooks)
pnpm build         # compile TypeScript -> build/
pnpm dev           # run with tsx, no build needed
pnpm test          # vitest
pnpm test:coverage # vitest with the enforced 100% thresholds
```

Code style is prettier (4 spaces, double quotes); the pre-commit hook runs it on staged files via lint-staged. See [architecture.md](architecture.md) for modules and conventions. Every code change needs tests: coverage thresholds are 100%.

## Release flow

Releases use [changesets](https://github.com/changesets/changesets).

1. In a feature branch run `pnpm changeset`, pick the bump (patch/minor/major) and describe the change. Commit the generated file.
2. Merge to `main`. `.github/workflows/publish.yml` runs tests and build, then opens a "version packages" PR.
3. Merging that PR publishes to npm and updates `CHANGELOG.md`. This needs the `NPM_TOKEN` repository secret (an npm automation token).

CI (`.github/workflows/ci.yml`) runs prettier, build and coverage on Node 18.17, 20 and 22 for pull requests and branch pushes.

## Live smoke test (maintainer only)

The smoke script is pinned to the maintainer's own Fiken demo company (`fiken-demo-radikal-lys-as`); to use it with yours, change `DEMO_SLUG` in `scripts/smoke.mjs` to a demo or test company that holds no real data. Opt-in test that spawns `build/index.js` and exercises the real Fiken API: read-only listing of every major resource, then write cycles against the demo company. Run `pnpm build` first, then:

```bash
FIKEN_SMOKE_CONFIRM=yes pnpm smoke
```

`FIKEN_API_TOKEN` and `FIKEN_COMPANY_SLUG` are read from the environment, falling back to `.env` in the repo root. It is never run by tests or CI.

| Variable              | Purpose                                                           |
| :-------------------- | :---------------------------------------------------------------- |
| `FIKEN_SMOKE_CONFIRM` | Must be `yes`, otherwise the script exits before any network call |

Write cycles (all records are named `fjordbook-mcp-smoke-<timestamp>`):

- Product and contact: create/get/update/delete.
- Invoice: draft → invoice via `fiken_create_invoice_from_draft` (never sent). Invoices cannot be deleted through the API, so this one stays in the demo company.
- Credit note: draft only (no credit note issued or sent); draft deleted.
- Sale: external-invoice sale + payment; payment and sale deleted.
- Purchase: draft + generated tiny PDF attachment (`fileBase64`); draft deleted.
- Journal entry: entry + reversing entry. The API has no delete, so the net-zero pair stays.

Safety guards:

- Aborts unless `FIKEN_COMPANY_SLUG` is exactly `fiken-demo-radikal-lys-as`; there is no override.
- Before any write, `fiken_list_companies` must contain the slug with "demo" or "test" in its name, and every write phase re-checks the slug (and `fiken_get_company`) before writing; otherwise the phase is skipped.
- Writes only target the configured slug, deletable test records are cleaned up in `finally`, the token is never printed, and `send_invoice`, `send_offer` and `send_credit_note` are never called.

Exit code is 1 if any step fails; a final "Findings" section lists unexpected API behaviour.
