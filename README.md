# Fjordbook MCP: Model Context Protocol Server for Fiken Accounting API

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/fjordbook-mcp.svg)](https://www.npmjs.com/package/fjordbook-mcp)

A Model Context Protocol (MCP) server that connects AI assistants like **Claude** and **Cursor** to the [Fiken accounting API](https://api.fiken.no/api/v2/docs/). Manage invoices, contacts, purchases, journal entries, and more — directly from your AI assistant.

Mutating tools are annotated so MCP clients can require your approval before they run (see [Safety](#safety)).

Fjordbook started as a fork of [gronnmann/fiken-mcp](https://github.com/gronnmann/fiken-mcp) and has since been extended and hardened into a separate project (full API coverage, safer client, toolset filtering, live smoke test).

---

## Quick start

1. Create a personal API token in Fiken (**Profile → API → Personal tokens**) and note your company slug (`fiken.no/company/YOUR-SLUG/...`).
2. Add the server to your MCP client. Example for Claude Desktop (`claude_desktop_config.json`):

```json
{
    "mcpServers": {
        "fjordbook": {
            "command": "npx",
            "args": ["-y", "fjordbook-mcp"],
            "env": {
                "FIKEN_API_TOKEN": "your-personal-token-here",
                "FIKEN_COMPANY_SLUG": "your-company-slug"
            }
        }
    }
}
```

3. Restart the client and ask: _"List my Fiken contacts"_.

Requires Node.js 18.17 or newer. Setup for Claude Code, Cursor, VS Code, Windows and local models, plus troubleshooting, is in the **[installation guide](docs/installation.md)**.

---

## Features

- **Invoices & Credit Notes**: Create, send, and manage invoices and credit notes with full draft support
- **Contacts**: Full CRUD for customers and suppliers, including contact persons
- **Purchases & Sales**: Record and manage purchases and sales transactions
- **Offers & Order Confirmations**: Create and send offers, convert to invoices
- **Accounting**: Bookkeeping accounts, bank accounts, journal entries, transactions
- **Reports**: Product sales reports, account balances
- **Time Tracking**: Projects, time entries, activities, team members
- **Complete API coverage**: Payments, accruals, recurring invoices, products, attachments, inbox and EHF documents
- **Reliable client**: One request at a time (Fiken rate limit), timeouts, safe retries, pagination info on list results

---

## Configuration

`FIKEN_API_TOKEN` and `FIKEN_COMPANY_SLUG` are required. Optional variables:

| Variable                 | Default    | Purpose                                                               |
| :----------------------- | :--------- | :-------------------------------------------------------------------- |
| `FIKEN_TIMEOUT_MS`       | `30000`    | Per-request timeout                                                   |
| `FIKEN_TOOLSETS`         | all        | Comma-separated toolsets to expose (see below); `user` is always on   |
| `FIKEN_UPLOAD_ROOT`      | unset      | If set, attachment uploads by file path must be inside this directory |
| `FIKEN_MAX_UPLOAD_BYTES` | `26214400` | Maximum attachment size (25 MB)                                       |

All 189 tools take roughly 47k tokens of context, too much for small local models. Set `FIKEN_TOOLSETS` to expose a subset, e.g. `FIKEN_TOOLSETS=contacts,products` (19 tools including `user`). Valid names: `user`, `accounts`, `contacts`, `invoices`, `creditNotes`, `offers`, `orderConfirmations`, `journalEntries`, `transactions`, `purchases`, `sales`, `misc`, `recurringInvoices`, `products`, `timeTracking`, `attachments`. Unknown names abort startup with an error.

Uploads by path are restricted to regular .pdf/.png/.jpg/.gif files whose content matches the extension; hidden directories (`~/.ssh`, `~/.aws`, ...) and system directories are refused unless `FIKEN_UPLOAD_ROOT` allows them.

---

## Available Tools

189 tools covering every operation of the Fiken API v2 (verified against the official OpenAPI spec by the test suite).

| Category                           | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :--------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User** (3)                       | `fiken_get_user`, `fiken_list_companies`, `fiken_get_company`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Accounts & Bank** (8)            | `fiken_list_accounts`, `fiken_get_account`, `fiken_list_account_balances`, `fiken_get_account_balance`, `fiken_list_bank_accounts`, `fiken_create_bank_account`, `fiken_get_bank_account`, `fiken_list_bank_balances`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Contacts** (11)                  | `fiken_list_contacts`, `fiken_create_contact`, `fiken_get_contact`, `fiken_update_contact`, `fiken_delete_contact`, `fiken_list_contact_persons`, `fiken_create_contact_person`, `fiken_get_contact_person`, `fiken_update_contact_person`, `fiken_delete_contact_person`, `fiken_list_groups`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Invoices** (16)                  | `fiken_list_invoices`, `fiken_create_invoice`, `fiken_get_invoice`, `fiken_update_invoice`, `fiken_get_invoice_attachments`, `fiken_send_invoice`, `fiken_get_invoice_counter`, `fiken_create_invoice_counter`, `fiken_list_invoice_drafts`, `fiken_create_invoice_draft`, `fiken_get_invoice_draft`, `fiken_update_invoice_draft`, `fiken_delete_invoice_draft`, `fiken_get_invoice_draft_attachments`, `fiken_create_recurring_invoice_from_draft`, `fiken_create_invoice_from_draft`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Recurring Invoices** (11)        | `fiken_list_recurring_invoices`, `fiken_create_recurring_invoice`, `fiken_get_recurring_invoice`, `fiken_update_recurring_invoice_lines`, `fiken_update_recurring_invoice_frequency`, `fiken_add_recurring_invoice_job`, `fiken_update_recurring_invoice_job_schedule`, `fiken_update_recurring_invoice_job_recipients`, `fiken_pause_recurring_invoice_job`, `fiken_resume_recurring_invoice_job`, `fiken_stop_recurring_invoice_job`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Credit Notes** (14)              | `fiken_list_credit_notes`, `fiken_get_credit_note`, `fiken_create_full_credit_note`, `fiken_create_partial_credit_note`, `fiken_send_credit_note`, `fiken_get_credit_note_counter`, `fiken_create_credit_note_counter`, `fiken_list_credit_note_drafts`, `fiken_create_credit_note_draft`, `fiken_get_credit_note_draft`, `fiken_update_credit_note_draft`, `fiken_delete_credit_note_draft`, `fiken_get_credit_note_draft_attachments`, `fiken_create_credit_note_from_draft`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Offers** (12)                    | `fiken_list_offers`, `fiken_get_offer`, `fiken_get_offer_counter`, `fiken_create_offer_counter`, `fiken_list_offer_drafts`, `fiken_create_offer_draft`, `fiken_get_offer_draft`, `fiken_update_offer_draft`, `fiken_delete_offer_draft`, `fiken_get_offer_draft_attachments`, `fiken_create_offer_from_draft`, `fiken_send_offer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Order Confirmations** (11)       | `fiken_list_order_confirmations`, `fiken_get_order_confirmation`, `fiken_get_order_confirmation_counter`, `fiken_create_order_confirmation_counter`, `fiken_create_invoice_draft_from_order_confirmation`, `fiken_list_order_confirmation_drafts`, `fiken_create_order_confirmation_draft`, `fiken_get_order_confirmation_draft`, `fiken_update_order_confirmation_draft`, `fiken_delete_order_confirmation_draft`, `fiken_create_order_confirmation_from_draft`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Products** (5)                   | `fiken_list_products`, `fiken_create_product`, `fiken_get_product`, `fiken_update_product`, `fiken_delete_product`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Purchases** (21)                 | `fiken_list_purchases`, `fiken_create_purchase`, `fiken_get_purchase`, `fiken_delete_purchase`, `fiken_get_purchase_attachments`, `fiken_add_purchase_attachment`, `fiken_list_purchase_drafts`, `fiken_create_purchase_draft`, `fiken_get_purchase_draft`, `fiken_update_purchase_draft`, `fiken_delete_purchase_draft`, `fiken_get_purchase_draft_attachments`, `fiken_create_purchase_from_draft`, `fiken_get_purchase_payments`, `fiken_create_purchase_payment`, `fiken_get_purchase_payment`, `fiken_delete_purchase_payment`, `fiken_get_purchase_accruals`, `fiken_create_purchase_accrual`, `fiken_get_purchase_accrual`, `fiken_delete_purchase_accrual`                                                                                                                                                                                                                                                      |
| **Sales** (22)                     | `fiken_list_sales`, `fiken_create_sale`, `fiken_get_sale`, `fiken_delete_sale`, `fiken_get_sale_attachments`, `fiken_list_sale_drafts`, `fiken_create_sale_draft`, `fiken_get_sale_draft`, `fiken_update_sale_draft`, `fiken_delete_sale_draft`, `fiken_get_sale_draft_attachments`, `fiken_create_sale_from_draft`, `fiken_settle_sale`, `fiken_write_off_sale`, `fiken_get_sale_payments`, `fiken_create_sale_payment`, `fiken_get_sale_payment`, `fiken_delete_sale_payment`, `fiken_get_sale_accruals`, `fiken_create_sale_accrual`, `fiken_get_sale_accrual`, `fiken_delete_sale_accrual`                                                                                                                                                                                                                                                                                                                          |
| **Journal Entries** (4)            | `fiken_list_journal_entries`, `fiken_get_journal_entry`, `fiken_get_journal_entry_attachments`, `fiken_create_journal_entry`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Transactions** (3)               | `fiken_list_transactions`, `fiken_get_transaction`, `fiken_delete_transaction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Attachments** (23)               | `fiken_add_contact_attachment`, `fiken_delete_contact_attachment`, `fiken_add_invoice_attachment`, `fiken_delete_invoice_attachment`, `fiken_add_invoice_draft_attachment`, `fiken_delete_invoice_draft_attachment`, `fiken_add_credit_note_draft_attachment`, `fiken_delete_credit_note_draft_attachment`, `fiken_add_journal_entry_attachment`, `fiken_delete_journal_entry_attachment`, `fiken_add_offer_draft_attachment`, `fiken_delete_offer_draft_attachment`, `fiken_add_order_confirmation_draft_attachment`, `fiken_delete_order_confirmation_draft_attachment`, `fiken_add_purchase_draft_attachment`, `fiken_delete_purchase_draft_attachment`, `fiken_add_sale_draft_attachment`, `fiken_delete_sale_draft_attachment`, `fiken_add_sale_attachment`, `fiken_delete_sale_attachment`, `fiken_delete_purchase_attachment`, `fiken_get_contact_attachments`, `fiken_get_order_confirmation_draft_attachments` |
| **Time Tracking & Projects** (18)  | `fiken_list_projects`, `fiken_create_project`, `fiken_get_project`, `fiken_update_project`, `fiken_delete_project`, `fiken_list_activities`, `fiken_create_activity`, `fiken_get_activity`, `fiken_update_activity`, `fiken_delete_activity`, `fiken_list_time_entries`, `fiken_create_time_entry`, `fiken_create_invoice_draft_from_time_entries`, `fiken_get_time_entry`, `fiken_update_time_entry`, `fiken_delete_time_entry`, `fiken_list_time_users`, `fiken_get_time_user`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Misc (reports, inbox, EHF)** (7) | `fiken_create_product_sales_report`, `fiken_list_inbox`, `fiken_create_inbox_document`, `fiken_get_inbox_document`, `fiken_delete_inbox_document`, `fiken_list_ehf_documents`, `fiken_get_ehf_document`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

> **Note**: Amounts are in NOK øre (1/100 of a krone). Dates use `YYYY-MM-DD` format.

---

---

## Safety

- Every tool carries MCP annotations: read-only tools are marked `readOnlyHint`, and deletes and full-record replacements (PUT updates) are marked `destructiveHint`, so clients can ask for approval before mutations.
- `send_invoice`, `send_offer` and `send_credit_note` email real recipients. Review before approving them.
- The token grants access to every company your Fiken user can reach. Use a dedicated token, pin `FIKEN_COMPANY_SLUG` to one company, and try new workflows on a demo company first.
- Uploads by path are restricted (see above). Tool inputs are schema-validated: ids cannot traverse to other endpoints, dates must be `YYYY-MM-DD`.
- This is an unofficial project, not affiliated with or endorsed by Fiken AS, and it was built with the help of Claude Code. Use at your own risk.

---

## Documentation

- [Installation guide](docs/installation.md): all clients, Windows, local models, troubleshooting
- [Development](docs/development.md): build, test, live smoke test, release flow
- [Architecture](docs/architecture.md): modules, conventions, client behaviour, spec conformance

## License

MIT, see [LICENSE](LICENSE).
