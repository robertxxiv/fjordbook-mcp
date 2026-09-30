---
"fiken-mcp": minor
---

Full Fiken API v2 coverage and a more reliable client.

- New tools: payments and accruals for sales/purchases, settle/write-off sale, recurring invoices, products, projects, activities, time entries, inbox, EHF documents, order confirmation drafts, attachment add/delete for all resources, transaction delete.
- Fix: `fiken_delete_sale` now calls the real `PATCH /sales/{id}/delete` operation.
- Tools audited against the OpenAPI spec (parameter names, required fields, enums).
- Client: requests are serialized (Fiken allows one concurrent request), 30s timeout, retry on 429/503, clearer auth errors.
- Server version is now read from `package.json`.
