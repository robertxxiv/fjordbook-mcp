# fjordbook-mcp

## 1.0.0

First release of Fjordbook, a fork of [gronnmann/fiken-mcp](https://github.com/gronnmann/fiken-mcp) extended into a standalone project.

- All 189 operations of the Fiken API v2 are available as tools (payments, accruals, recurring invoices, products, projects, time entries, inbox, EHF documents, order confirmation drafts, attachments for all resources, transaction delete). A spec-conformance test checks every tool against the OpenAPI spec.
- Reliable client: one request at a time (Fiken's limit), 30s timeout, retry on 429/503 (503 only for GET), pagination info on list results, clearer auth errors.
- Safer inputs: ids cannot traverse to other endpoints, uploads by path are restricted, dates are validated (`YYYY-MM-DD`), PUT updates and deletes are marked destructive, upload tools advertise real input schemas.
- Account/VAT hints on create tools. `fiken_delete_sale` calls the real `PATCH /sales/{id}/delete` operation.
- `FIKEN_TOOLSETS` exposes a subset of tool modules for small context windows.
- Opt-in live smoke test (`pnpm smoke`), CI on Node 18.17/20/22, lint-staged hook.
