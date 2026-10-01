#!/usr/bin/env node
// Opt-in LIVE smoke test: spawns build/index.js over stdio and exercises it against the real Fiken API.
// Safety guards are documented in README.md ("Live smoke test"). Never run against a real company.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_SLUG = "fiken-demo-radikal-lys-as";

function loadDotEnv() {
    const out = {};
    let text;
    try {
        text = readFileSync(join(root, ".env"), "utf8");
    } catch {
        return out;
    }
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || line.trim().startsWith("#")) continue;
        out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    return out;
}

const dot = loadDotEnv();
const pick = (k) => process.env[k] || dot[k];
const token = pick("FIKEN_API_TOKEN");
const slug = pick("FIKEN_COMPANY_SLUG");

function abort(msg) {
    console.error(`smoke: refusing to run: ${msg}`);
    process.exit(2);
}

// Guards 1 and 2: no network, no child process before these pass.
if (process.env.FIKEN_SMOKE_CONFIRM !== "yes")
    abort("set FIKEN_SMOKE_CONFIRM=yes to run live tests");
if (!token) abort("FIKEN_API_TOKEN is not set (environment or .env)");
if (!slug) abort("FIKEN_COMPANY_SLUG is not set (environment or .env)");
if (slug !== DEMO_SLUG)
    abort(`slug "${slug}" is not the demo company "${DEMO_SLUG}"; no override exists`);

const redact = (s) => String(s).split(token).join("[redacted]");
const results = [];
const findings = [];
const record = (name, result, note = "") => {
    results.push({ name, result, note: redact(note).replace(/\s+/g, " ").slice(0, 200) });
};
const finding = (msg) => findings.push(redact(msg));

const client = new Client({ name: "fiken-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "build/index.js")],
    env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)),
        FIKEN_API_TOKEN: token,
        FIKEN_COMPANY_SLUG: slug,
    },
    stderr: "ignore",
});

let toolSchemas = new Map();

/** Calls a tool; returns { ok, data, text }. Never throws. */
async function call(name, args = {}) {
    if (!toolSchemas.has(name))
        return { ok: false, text: "tool not found in tools/list", missing: true };
    try {
        const res = await client.callTool({ name, arguments: args });
        const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
        if (res.isError) return { ok: false, text };
        try {
            return { ok: true, data: JSON.parse(text), text };
        } catch {
            return { ok: false, text: `result is not JSON: ${text.slice(0, 80)}` };
        }
    } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
}

const paged = (name) => {
    const props = toolSchemas.get(name)?.inputSchema?.properties ?? {};
    return "page" in props && "pageSize" in props ? { page: 0, pageSize: 5 } : {};
};

function checkShape(name, data) {
    if (data && typeof data === "object" && "items" in data && "pagination" in data) {
        const p = data.pagination;
        const bad = ["page", "pageSize", "pageCount", "resultCount"].filter(
            (k) => typeof p?.[k] !== "number",
        );
        if (bad.length) return `pagination fields not numeric: ${bad.join(", ")}`;
    }
    return undefined;
}

async function readStep(name, args) {
    const a = { ...paged(name), ...args };
    const r = await call(name, a);
    if (r.missing) {
        record(name, "SKIP", r.text);
        return undefined;
    }
    if (!r.ok && /Fiken 402/.test(r.text)) {
        record(name, "SKIP", "module not activated on demo company (402)");
        return undefined;
    }
    if (!r.ok) {
        record(name, "FAIL", r.text);
        finding(`${name}: ${redact(r.text).slice(0, 300)}`);
        return undefined;
    }
    const bad = checkShape(name, r.data);
    if (bad) {
        record(name, "FAIL", bad);
        finding(`${name}: ${bad}`);
        return r.data;
    }
    const n = Array.isArray(r.data?.items)
        ? r.data.items.length
        : Array.isArray(r.data)
          ? r.data.length
          : undefined;
    record(name, "PASS", n === undefined ? "" : `${n} item(s)`);
    return r.data;
}

const idFromLocation = (loc) => {
    const seg = String(loc ?? "")
        .split("/")
        .filter(Boolean)
        .pop();
    return seg && /^\d+$/.test(seg) ? Number(seg) : undefined;
};

/** Runs one write-cycle step; returns the call result or undefined (recorded as SKIP/FAIL). */
async function step(label, name, args, { expect } = {}) {
    const r = await call(name, args);
    const tag = `${name} (${label})`;
    if (r.missing) {
        record(tag, "SKIP", r.text);
        return undefined;
    }
    if (!r.ok) {
        record(tag, "FAIL", r.text);
        finding(`${tag}: ${redact(r.text).slice(0, 300)}`);
        return undefined;
    }
    const wrong = expect?.(r.data);
    if (wrong) {
        record(tag, "FAIL", wrong);
        finding(`${tag}: ${wrong}`);
        return undefined;
    }
    record(tag, "PASS");
    return r;
}

async function createAndResolve(label, createName, args, listName, listArgs) {
    const r = await step(label, createName, args, {
        expect: (d) =>
            d?.created === true
                ? undefined
                : `expected {created:true,location}, got ${JSON.stringify(d).slice(0, 100)}`,
    });
    if (!r) return undefined;
    let id = idFromLocation(r.data.location);
    if (id === undefined) {
        finding(
            `${createName}: Location header missing or without numeric id; falling back to list`,
        );
        const l = await call(listName, listArgs);
        const items = l.data?.items ?? l.data;
        id = Array.isArray(items)
            ? Object.values(items[0] ?? {}).find(Number.isInteger)
            : undefined;
        if (id === undefined)
            record(`${createName} (resolve id)`, "FAIL", "could not resolve created id");
    }
    return id;
}

async function productCycle(ts) {
    const name = `fiken-mcp-smoke-${ts}`;
    const body = { name, unitPrice: 1000, incomeAccount: "3000", vatType: "HIGH", active: true };
    let id;
    try {
        id = await createAndResolve("create", "fiken_create_product", body, "fiken_list_products", {
            name,
        });
        if (id === undefined) {
            record("fiken_get_product", "SKIP", "no product id");
            record("fiken_update_product", "SKIP", "no product id");
            return;
        }
        await step(
            "get",
            "fiken_get_product",
            { productId: id },
            {
                expect: (d) => (d?.name === name ? undefined : `name mismatch: ${d?.name}`),
            },
        );
        await step("update", "fiken_update_product", {
            productId: id,
            ...body,
            unitPrice: 2000,
            note: "smoke update",
        });
        await step(
            "verify update",
            "fiken_get_product",
            { productId: id },
            {
                expect: (d) =>
                    d?.unitPrice === 2000 ? undefined : `unitPrice not updated: ${d?.unitPrice}`,
            },
        );
    } finally {
        if (id !== undefined) {
            const r = await call("fiken_delete_product", { productId: id });
            if (r.ok) record("fiken_delete_product", "PASS");
            else {
                record("fiken_delete_product", "FAIL", r.text);
                finding(`fiken_delete_product: ${redact(r.text).slice(0, 300)}`);
                const u = await call("fiken_update_product", {
                    productId: id,
                    ...body,
                    active: false,
                });
                record(
                    "fiken_update_product (mark inactive)",
                    u.ok ? "PASS" : "FAIL",
                    u.ok ? "" : u.text,
                );
            }
        }
    }
}

async function contactCycle(ts) {
    const name = `fiken-mcp-smoke-${ts}`;
    const body = { name, customer: true };
    let id;
    try {
        id = await createAndResolve("create", "fiken_create_contact", body, "fiken_list_contacts", {
            name,
        });
        if (id === undefined) {
            record("fiken_get_contact", "SKIP", "no contact id");
            record("fiken_update_contact", "SKIP", "no contact id");
            return;
        }
        await step(
            "get",
            "fiken_get_contact",
            { contactId: id },
            {
                expect: (d) => (d?.name === name ? undefined : `name mismatch: ${d?.name}`),
            },
        );
        await step("update", "fiken_update_contact", {
            contactId: id,
            ...body,
            email: "smoke@example.com",
        });
        await step(
            "verify update",
            "fiken_get_contact",
            { contactId: id },
            {
                expect: (d) =>
                    d?.email === "smoke@example.com" ? undefined : `email not updated: ${d?.email}`,
            },
        );
    } finally {
        if (id !== undefined) {
            const r = await call("fiken_delete_contact", { contactId: id });
            if (r.ok) record("fiken_delete_contact", "PASS");
            else {
                record("fiken_delete_contact", "FAIL", r.text);
                finding(`fiken_delete_contact: ${redact(r.text).slice(0, 300)}`);
                const u = await call("fiken_update_contact", {
                    contactId: id,
                    ...body,
                    inactive: true,
                });
                record(
                    "fiken_update_contact (mark inactive)",
                    u.ok ? "PASS" : "FAIL",
                    u.ok ? "" : u.text,
                );
            }
        }
    }
}

let demoVerified = false;
/** Re-verifies the demo slug before every write phase; false means the phase must not run. */
async function ensureDemo(phase) {
    if (slug !== DEMO_SLUG || !demoVerified) {
        record(`${phase} phase`, "SKIP", "demo company not verified");
        return false;
    }
    const r = await call("fiken_get_company", {});
    const got = r.data?.slug;
    if (!r.ok || (got !== undefined && got !== DEMO_SLUG)) {
        record(`${phase} phase`, "SKIP", `company check failed (slug ${got ?? "unknown"})`);
        return false;
    }
    return true;
}

/** Minimal one-page PDF generated in memory (no file written). */
const tinyPdf = (text) =>
    Buffer.from(
        `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 50]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${text.length + 33}>>stream\nBT /F1 10 Tf 10 20 Td (${text}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n`,
    );

const today = () => new Date().toISOString().slice(0, 10);
const bankAccount = async () => {
    const r = await call("fiken_list_bank_accounts", { page: 0, pageSize: 5 });
    const items = r.data?.items ?? r.data;
    return Array.isArray(items)
        ? items.find((b) => b.accountCode && b.bankAccountNumber)
        : undefined;
};

async function cleanup(label, name, args, fallback) {
    const r = await call(name, args);
    if (r.ok) return record(`${name} (${label})`, "PASS");
    record(`${name} (${label})`, "FAIL", r.text);
    finding(`${name} (${label}): ${redact(r.text).slice(0, 300)}`);
    if (fallback) {
        const u = await call(fallback.name, fallback.args);
        record(
            `${fallback.name} (${label}, mark inactive)`,
            u.ok ? "PASS" : "FAIL",
            u.ok ? "" : u.text,
        );
    }
}

/** Creates a throwaway customer; the caller cleans it up. */
async function smokeCustomer(ts, label) {
    const name = `fiken-mcp-smoke-${ts}-${label}`;
    const body = { name, customer: true };
    const id = await createAndResolve(
        "create customer",
        "fiken_create_contact",
        body,
        "fiken_list_contacts",
        { name },
    );
    const cleanupCustomer = () =>
        cleanup(
            "customer",
            "fiken_delete_contact",
            { contactId: id },
            {
                name: "fiken_update_contact",
                args: { contactId: id, ...body, inactive: true },
            },
        );
    return { id, cleanupCustomer };
}

const invoiceLine = { quantity: 1, unitPrice: 1000, vatType: "HIGH", incomeAccount: "3000" };
const draftBase = (ts, customerId, type, bankAccountNumber) => ({
    bankAccountNumber,
    type,
    daysUntilDueDate: 14,
    customerId,
    issueDate: today(),
    invoiceText: `fiken-mcp-smoke-${ts}`,
    lines: [{ ...invoiceLine, description: `fiken-mcp-smoke-${ts}` }],
});

/** Invoice draft -> invoice (never sent). Invoices cannot be deleted via the API; the record stays, named fiken-mcp-smoke-<ts>. */
async function invoiceCycle(ts) {
    if (!(await ensureDemo("invoice"))) return;
    const bank = await bankAccount();
    if (!bank) return record("invoice cycle", "SKIP", "no bank account found");
    const { id: customerId, cleanupCustomer } = await smokeCustomer(ts, "inv");
    let draftId;
    try {
        if (customerId === undefined) return record("invoice cycle", "SKIP", "no customer id");
        draftId = await createAndResolve(
            "create",
            "fiken_create_invoice_draft",
            draftBase(ts, customerId, "invoice", bank.bankAccountNumber),
            "fiken_list_invoice_drafts",
            {},
        );
        if (draftId === undefined) return;
        await step("get", "fiken_get_invoice_draft", { draftId });
        if (!(await ensureDemo("invoice (create from draft)"))) return;
        const inv = await step("from draft", "fiken_create_invoice_from_draft", { draftId });
        if (!inv) return;
        draftId = undefined; // consumed by the draft->invoice conversion
        const invoiceId = idFromLocation(inv.data?.location);
        if (invoiceId === undefined)
            return finding("fiken_create_invoice_from_draft: no numeric invoice id in location");
        await step(
            "get",
            "fiken_get_invoice",
            { invoiceId },
            {
                expect: (d) =>
                    d?.invoiceId === invoiceId || d?.invoiceNumber
                        ? undefined
                        : "unexpected invoice body",
            },
        );
        record(
            "invoice cleanup",
            "SKIP",
            `invoices are not deletable; left as fiken-mcp-smoke-${ts} (not sent)`,
        );
    } finally {
        if (draftId !== undefined)
            await cleanup("draft", "fiken_delete_invoice_draft", { draftId });
        await cleanupCustomer();
    }
}

/** Credit-note draft only (no credit note is issued or sent); the draft is deleted. */
async function creditNoteDraftCycle(ts) {
    if (!(await ensureDemo("credit note"))) return;
    const bank = await bankAccount();
    if (!bank) return record("credit note cycle", "SKIP", "no bank account found");
    const { id: customerId, cleanupCustomer } = await smokeCustomer(ts, "cn");
    let draftId;
    try {
        if (customerId === undefined) return record("credit note cycle", "SKIP", "no customer id");
        draftId = await createAndResolve(
            "create",
            "fiken_create_credit_note_draft",
            draftBase(ts, customerId, "credit_note", bank.bankAccountNumber),
            "fiken_list_credit_note_drafts",
            {},
        );
        if (draftId !== undefined) await step("get", "fiken_get_credit_note_draft", { draftId });
    } finally {
        if (draftId !== undefined)
            await cleanup("draft", "fiken_delete_credit_note_draft", { draftId });
        await cleanupCustomer();
    }
}

/** External-invoice sale + payment; payment then sale are deleted (sale deletion needs a description). */
async function salePaymentCycle(ts) {
    if (!(await ensureDemo("sale payment"))) return;
    const account = (await bankAccount())?.accountCode;
    if (!account) return record("sale payment cycle", "SKIP", "no bank account found");
    const { id: customerId, cleanupCustomer } = await smokeCustomer(ts, "sale");
    let saleId;
    let paymentId;
    try {
        if (customerId === undefined) return record("sale payment cycle", "SKIP", "no customer id");
        const r = await step("create", "fiken_create_sale", {
            date: today(),
            kind: "external_invoice",
            currency: "NOK",
            customerId,
            dueDate: today(),
            saleNumber: `smoke-${ts}`,
            lines: [
                {
                    description: `fiken-mcp-smoke-${ts}`,
                    vatType: "HIGH",
                    netPrice: 1000,
                    vat: 250,
                    account: "3000",
                },
            ],
        });
        saleId = idFromLocation(r?.data?.location);
        if (saleId === undefined)
            return r && finding("fiken_create_sale: no numeric sale id in location");
        if (!(await ensureDemo("sale payment (pay)"))) return;
        const p = await step("pay", "fiken_create_sale_payment", {
            saleId,
            date: today(),
            account,
            amount: 1000,
        });
        paymentId = idFromLocation(p?.data?.location);
        await step("get payments", "fiken_get_sale_payments", { saleId });
    } finally {
        if (saleId !== undefined) {
            if (paymentId !== undefined)
                await cleanup("payment", "fiken_delete_sale_payment", { saleId, paymentId });
            await cleanup("sale", "fiken_delete_sale", {
                saleId,
                description: `fiken-mcp-smoke-${ts} cleanup`,
            });
        }
        await cleanupCustomer();
    }
}

/** Purchase draft + generated attachment; deleting the draft removes both. */
async function purchaseDraftCycle(ts) {
    if (!(await ensureDemo("purchase draft"))) return;
    let draftId;
    try {
        draftId = await createAndResolve(
            "create",
            "fiken_create_purchase_draft",
            {
                cash: false,
                paid: false,
                invoiceIssueDate: today(),
                dueDate: today(),
                invoiceNumber: `smoke-${ts}`,
                lines: [
                    {
                        text: `fiken-mcp-smoke-${ts}`,
                        vatType: "NONE",
                        incomeAccount: "6540",
                        net: 1000,
                        gross: 1000,
                    },
                ],
            },
            "fiken_list_purchase_drafts",
            {},
        );
        if (draftId === undefined) return;
        if (!(await ensureDemo("purchase draft (attach)"))) return;
        await step("attach", "fiken_add_purchase_draft_attachment", {
            draftId,
            filename: `fiken-mcp-smoke-${ts}.pdf`,
            fileBase64: tinyPdf(`fiken-mcp-smoke-${ts}`).toString("base64"),
        });
        await step(
            "get attachments",
            "fiken_get_purchase_draft_attachments",
            { draftId },
            {
                expect: (d) => ((d?.items ?? d)?.length >= 1 ? undefined : "attachment not listed"),
            },
        );
    } finally {
        if (draftId !== undefined)
            await cleanup("draft", "fiken_delete_purchase_draft", { draftId });
    }
}

/** Journal entry + reversing entry. The API has no delete, so both stay, named fiken-mcp-smoke-<ts>. */
async function journalEntryCycle(ts) {
    if (!(await ensureDemo("journal entry"))) return;
    const bank = (await bankAccount())?.accountCode;
    if (!bank) return record("journal entry cycle", "SKIP", "no bank account found");
    const entry = (description, debitAccount, creditAccount) => ({
        journalEntries: [
            { description, date: today(), lines: [{ amount: 100, debitAccount, creditAccount }] },
        ],
    });
    const name = `fiken-mcp-smoke-${ts}`;
    const r = await step("create", "fiken_create_journal_entry", entry(name, "6800", bank));
    if (!r) return;
    // The Location id is a transaction id, not a journalEntryId: resolve via the list instead.
    const l = await call("fiken_list_journal_entries", { date: today(), page: 0, pageSize: 100 });
    const found = (l.data?.items ?? []).find((j) => String(j.description ?? "").includes(name));
    if (found?.journalEntryId !== undefined)
        await step("get", "fiken_get_journal_entry", { journalEntryId: found.journalEntryId });
    else record("fiken_get_journal_entry (get)", "SKIP", "entry not found in first list page");
    if (!(await ensureDemo("journal entry (reverse)"))) return;
    await step("reverse", "fiken_create_journal_entry", entry(`${name} reversal`, bank, "6800"));
    record("journal entry cleanup", "SKIP", `no delete API; net-zero pair left as ${name}`);
}

function printReport() {
    const w = Math.max(4, ...results.map((r) => r.name.length));
    console.log(`\n${"tool".padEnd(w)} | result | note`);
    console.log(`${"-".repeat(w)}-|--------|-----`);
    for (const r of results) console.log(`${r.name.padEnd(w)} | ${r.result.padEnd(6)} | ${r.note}`);
    const count = (s) => results.filter((r) => r.result === s).length;
    console.log(`\nPASS ${count("PASS")}  FAIL ${count("FAIL")}  SKIP ${count("SKIP")}`);
    console.log("\nFindings");
    if (findings.length) for (const f of findings) console.log(`- ${f}`);
    else console.log("- none");
}

async function main() {
    await client.connect(transport);
    const { tools } = await client.listTools();
    toolSchemas = new Map(tools.map((t) => [t.name, t]));

    // Guard 3: verify the company before any write.
    let writeAllowed = false;
    const companies = await call("fiken_list_companies", paged("fiken_list_companies"));
    if (!companies.ok) {
        record("fiken_list_companies", "FAIL", companies.text);
        record("write phase", "SKIP", "could not verify company");
    } else {
        const list = companies.data?.items ?? companies.data;
        const co = Array.isArray(list) ? list.find((c) => c.slug === slug) : undefined;
        if (!co) record("write phase", "SKIP", "slug not found in fiken_list_companies");
        else if (!/demo|test/i.test(co.name ?? ""))
            record("write phase", "SKIP", `company name "${co.name}" lacks demo/test`);
        else writeAllowed = demoVerified = true;
    }

    // Phase 1: read-only.
    await readStep("fiken_get_user");
    await readStep("fiken_list_companies");
    await readStep("fiken_get_company");
    for (const t of [
        "fiken_list_accounts",
        "fiken_list_bank_accounts",
        "fiken_list_contacts",
        "fiken_list_products",
        "fiken_list_invoices",
        "fiken_list_purchases",
        "fiken_list_sales",
        "fiken_list_journal_entries",
        "fiken_list_projects",
        "fiken_list_time_entries",
        "fiken_list_activities",
        "fiken_list_inbox",
        "fiken_list_recurring_invoices",
        "fiken_list_order_confirmations",
        "fiken_list_offers",
        "fiken_list_credit_notes",
    ])
        await readStep(t);

    // Phase 2: writes, demo company only.
    if (writeAllowed) {
        const ts = Date.now();
        await productCycle(ts);
        await contactCycle(ts);
        await invoiceCycle(ts);
        await creditNoteDraftCycle(ts);
        await salePaymentCycle(ts);
        await purchaseDraftCycle(ts);
        await journalEntryCycle(ts);
    }
}

let code = 0;
try {
    await main();
} catch (e) {
    record("smoke harness", "FAIL", e instanceof Error ? e.message : String(e));
} finally {
    await client.close().catch(() => {});
    printReport();
    if (results.some((r) => r.result === "FAIL")) code = 1;
}
process.exit(code);
