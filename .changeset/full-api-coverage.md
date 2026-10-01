---
"fiken-mcp": minor
---

Full Fiken API v2 coverage and a more reliable client.

- New tools: payments and accruals for sales/purchases, settle/write-off sale, recurring invoices, products, projects, activities, time entries, inbox, EHF documents, order confirmation drafts, attachment add/delete for all resources, transaction delete.
- Fix: `fiken_delete_sale` now calls the real `PATCH /sales/{id}/delete` operation.
- Tools audited against the OpenAPI spec (parameter names, required fields, enums).
- Client: requests are serialized (Fiken allows one concurrent request), 30s timeout, retry on 429/503, clearer auth errors.
- Server version is now read from `package.json`.
- Security: path ids can no longer traverse to other endpoints/companies (schema validation plus a client guard); file uploads by path are restricted (regular files only, size cap, magic-byte check, hidden/system directories refused, optional `FIKEN_UPLOAD_ROOT`).
- Settle and write-off sale are now marked destructive; 503 is only retried for GET so writes are never duplicated.
- A spec-conformance test verifies every tool against the OpenAPI spec (189 operations, 189 tools).
- Date inputs (`YYYY-MM-DD`) are validated by the schema; PUT update tools are marked destructive and say they replace the whole record; account/VAT hints on create tools; the 401 token hint only appears for generic bodies.
- New `FIKEN_TOOLSETS` env var exposes a subset of tool modules (smaller context for local models).
