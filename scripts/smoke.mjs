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
const allowSlug = process.env.FIKEN_SMOKE_ALLOW_SLUG || undefined;

function abort(msg) {
    console.error(`smoke: refusing to run: ${msg}`);
    process.exit(2);
}

// Guards 1 and 2: no network, no child process before these pass.
if (process.env.FIKEN_SMOKE_CONFIRM !== "yes")
    abort("set FIKEN_SMOKE_CONFIRM=yes to run live tests");
if (!token) abort("FIKEN_API_TOKEN is not set (environment or .env)");
if (!slug) abort("FIKEN_COMPANY_SLUG is not set (environment or .env)");
if (slug !== DEMO_SLUG && allowSlug !== slug) {
    abort(`slug "${slug}" is not the demo company; set FIKEN_SMOKE_ALLOW_SLUG=${slug} to override`);
}

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
        else if (!allowSlug && !/demo|test/i.test(co.name ?? ""))
            record("write phase", "SKIP", `company name "${co.name}" lacks demo/test`);
        else writeAllowed = true;
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
