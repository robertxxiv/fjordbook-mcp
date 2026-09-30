# Architecture

`fiken-mcp` is an unofficial MCP server for the [Fiken API v2](https://api.fiken.no/api/v2/docs/)
(OpenAPI spec: `https://api.fiken.no/api/v2/docs/swagger.yaml`). It runs over stdio and is
published to npm as `fiken-mcp`.

## Stack

TypeScript (ESM, `module: Node16`, so relative imports need the `.js` suffix), `@modelcontextprotocol/sdk`,
`zod` for tool input schemas, pnpm, vitest, prettier, husky, changesets.

## Layout

| Path                  | Role                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `src/index.ts`        | Creates the `McpServer` (version read from `package.json`), registers every module, connects stdio |
| `src/client.ts`       | The only HTTP layer: `get`, `mutate`, `uploadMultipart`, `cp()` (company-scoped path), `slug()`    |
| `src/tools/<area>.ts` | One module per API area, each exporting `register(server)`                                         |
| `src/tools/shared.ts` | Annotation constants `R`/`W`/`D` and the `ok()`/`err()` result helpers                             |
| `src/__tests__/`      | One test file per module, using `createMockServer()` from `helpers.ts`                             |

Tool modules: user, accounts, contacts, invoices, creditNotes, offers, orderConfirmations,
journalEntries, transactions, purchases, sales, misc (about 106 tools in total).

## Conventions

- **Config:** `FIKEN_API_TOKEN` and `FIKEN_COMPANY_SLUG` environment variables, read lazily at call time
  (a missing one throws on first request, not at startup).
- **Tool names:** `fiken_<verb>_<resource>`, registered with `server.registerTool`.
- **Annotations:** `R` = read-only, `W` = write, `D` = destructive. MCP clients use these to require user
  approval for mutations; this is how the README's approval promise is delivered.
- **Results:** handlers return `ok(data)` (pretty JSON) or `err(e)` (`isError: true`); they never throw.
- **Client errors:** any non-2xx response throws `Fiken <status>: <body>`. Mutations map 204 to
  `{ success: true }` and 201 to `{ created: true, location }`.
- **Adding an endpoint:** add the tool in the matching `src/tools/` module, add tests in the matching
  `src/__tests__/tools/` file, and add a changeset.

## Testing

`pnpm test` (vitest). Coverage thresholds in `vitest.config.ts` are 100% for lines, branches,
functions and statements (`pnpm test:coverage`). Tool tests call handlers through the mock server
and stub `fetch`; nothing talks to the real API.

## Build and release

- `pnpm build` runs `tsc` into `build/`; `bin` points at `build/index.js`.
- The husky pre-commit hook runs `prettier . --write`; it reformats the working tree after staging,
  so check `git status` after committing.
- Releases use changesets: `.github/workflows/publish.yml` runs on `master`, runs tests and build, then
  opens a version PR or publishes to npm.

## Known gaps

The OpenAPI spec exposes more operations than the tools cover (recurring invoices, products,
attachments, accruals, payments on purchases/sales, time entries, inbox and others, pending a proper
audit), and `DELETE /companies/{slug}/sales/{id}` is called by a tool but is not in the spec.
