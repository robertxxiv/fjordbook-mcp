import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { _resetForTests } from "../client.js";
import { register as registerUser } from "../tools/user.js";
import { register as registerAccounts } from "../tools/accounts.js";
import { register as registerContacts } from "../tools/contacts.js";
import { register as registerInvoices } from "../tools/invoices.js";
import { register as registerCreditNotes } from "../tools/creditNotes.js";
import { register as registerOffers } from "../tools/offers.js";
import { register as registerOrderConfirmations } from "../tools/orderConfirmations.js";
import { register as registerJournalEntries } from "../tools/journalEntries.js";
import { register as registerTransactions } from "../tools/transactions.js";
import { register as registerPurchases } from "../tools/purchases.js";
import { register as registerSales } from "../tools/sales.js";
import { register as registerMisc } from "../tools/misc.js";
import { register as registerRecurringInvoices } from "../tools/recurringInvoices.js";
import { register as registerProducts } from "../tools/products.js";
import { register as registerTimeTracking } from "../tools/timeTracking.js";
import { register as registerAttachments } from "../tools/attachments.js";
import { loadSpec, matchOperation, sample, type Operation } from "./conformanceHelpers.js";

/**
 * Spec-conformance test: runs every registered tool through the REAL client with a stubbed
 * global fetch and checks the resulting HTTP request against docs/fiken-openapi.yaml.
 * (The per-module tests mock ../client.js, so they cannot catch wrong endpoints or params.)
 */

/**
 * KNOWN_DEFECTS: real tool/spec mismatches found by this test. Each entry is
 * `tool name -> [problem code prefixes]`; matching problems are tolerated so the suite stays
 * green. Fix the tool, then delete the entry. Keep this list minimal.
 */
const KNOWN_DEFECTS: Record<string, string[]> = {};

/**
 * UNREACHABLE: spec operations deliberately not covered by any tool. Keep empty unless an
 * operation truly cannot be exposed; each entry needs a reason.
 */
const UNREACHABLE: Record<string, string> = {};

const modules = [
    registerUser,
    registerAccounts,
    registerContacts,
    registerInvoices,
    registerCreditNotes,
    registerOffers,
    registerOrderConfirmations,
    registerJournalEntries,
    registerTransactions,
    registerPurchases,
    registerSales,
    registerMisc,
    registerRecurringInvoices,
    registerProducts,
    registerTimeTracking,
    registerAttachments,
];

interface Annotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
}
type Handler = (params: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
interface Tool {
    name: string;
    annotations: Annotations;
    schema: z.ZodTypeAny;
    handler: Handler;
}

const registered: Tool[] = [];
const server = {
    registerTool(
        name: string,
        config: { annotations?: Annotations; inputSchema?: unknown },
        handler: Handler,
    ) {
        const input = config.inputSchema;
        const schema =
            input instanceof z.ZodType
                ? input
                : z.object((input ?? {}) as Record<string, z.ZodTypeAny>);
        registered.push({ name, annotations: config.annotations ?? {}, schema, handler });
    },
} as unknown as McpServer;
for (const register of modules) register(server);

const SLUG = "test-co";
const spec = loadSpec();

interface Recorded {
    method: string;
    path: string;
    query: string[];
    json?: Record<string, unknown>;
    form?: string[];
    hasBody: boolean;
}

let recorded: Recorded[] = [];
const called = new Map<string, string[]>(); // operation key -> tool names
let tmp: string;
let filePath: string;

function record(url: URL, init: RequestInit): void {
    const body = init.body;
    const rec: Recorded = {
        method: init.method ?? "GET",
        path: url.pathname
            .replace(/^\/api\/v2/, "")
            .replace(`/companies/${SLUG}`, `/companies/{slug}`),
        query: [...url.searchParams.keys()],
        hasBody: body !== undefined && body !== null,
    };
    if (typeof body === "string") rec.json = JSON.parse(body);
    else if (body instanceof FormData) rec.form = [...body.keys()];
    recorded.push(rec);
}

beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "fiken-conformance-"));
    filePath = join(tmp, "sample.pdf");
    writeFileSync(filePath, "%PDF-1.4\n");
    vi.stubEnv("FIKEN_API_TOKEN", "test-token");
    vi.stubEnv("FIKEN_COMPANY_SLUG", SLUG);
    // Skip the client's 250ms request spacing.
    vi.stubGlobal("setTimeout", (fn: () => void) => {
        fn();
        return 0;
    });
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL, init: RequestInit) => {
            record(url, init);
            return new Response("{}", {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }),
    );
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
});

/** Problems are `code:detail` strings; a problem is tolerated if a KNOWN_DEFECTS prefix matches. */
function isKnown(tool: string, problem: string): boolean {
    return (KNOWN_DEFECTS[tool] ?? []).some((p) => problem.startsWith(p));
}

function checkRequest(tool: Tool, rec: Recorded, op: Operation | undefined): string[] {
    const problems: string[] = [];
    if (!op) {
        return [`path:${rec.method} ${rec.path} is not in the spec`];
    }
    for (const q of rec.query) {
        if (!op.queryParams.has(q)) problems.push(`query:${q} not documented for ${op.key}`);
    }
    for (const q of op.requiredQuery) {
        if (!rec.query.includes(q)) problems.push(`query-missing:${q} required by ${op.key}`);
    }
    if (rec.hasBody && !op.hasBody) problems.push(`body:sent a body but ${op.key} has none`);
    if (!rec.hasBody && op.bodyRequired) problems.push(`body-missing:${op.key} needs a body`);
    const keys = rec.json ? Object.keys(rec.json) : (rec.form ?? []);
    const bodySpec = rec.json ? op.json : op.multipart;
    if (rec.hasBody && op.hasBody && !bodySpec) {
        problems.push(`body:content type of the sent body is not declared by ${op.key}`);
    }
    if (bodySpec) {
        for (const k of keys) {
            if (!bodySpec.props.has(k)) problems.push(`body-key:${k} not documented for ${op.key}`);
        }
        for (const r of bodySpec.required) {
            if (!keys.includes(r)) problems.push(`body-missing:${r} required by ${op.key}`);
            // Where the tool forwards a same-named input field, it must be required there too.
            const shape = (tool.schema as z.AnyZodObject).shape as
                | Record<string, z.ZodTypeAny>
                | undefined;
            if (shape?.[r]?.isOptional()) {
                problems.push(
                    `body-required-optional:${r} is optional in the tool but required by ${op.key}`,
                );
            }
        }
    }
    return problems;
}

describe("tool registry", () => {
    it("registers unique tool names", () => {
        const names = registered.map((t) => t.name);
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
        expect(names.length).toBeGreaterThan(0);
    });
});

describe.each(registered.map((t) => [t.name, t] as const))("%s", (_name, tool) => {
    it("calls a documented Fiken operation correctly", async () => {
        _resetForTests();
        recorded = [];
        const input = sample(tool.schema, "", { filePath }) as Record<string, unknown>;
        // filePath and fileBase64 are mutually exclusive alternatives: exercise filePath.
        if ("filePath" in input && "fileBase64" in input) delete input.fileBase64;
        // Some tools demand exactly one of file / ehf / inbox document: fall back to the file.
        if (!tool.schema.safeParse(input).success) {
            delete input.fileBase64;
            delete input.ehfDocumentId;
            delete input.inboxDocumentId;
        }
        const parsed = tool.schema.safeParse(input);
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

        const result = await tool.handler(parsed.data);
        const problems: string[] = [];
        if (result.isError) problems.push(`result-error:${result.content[0]?.text}`);
        if (recorded.length !== 1)
            problems.push(`calls:expected 1 request, saw ${recorded.length}`);

        for (const rec of recorded) {
            const op = matchOperation(spec, rec.method, rec.path);
            if (op) called.set(op.key, [...(called.get(op.key) ?? []), tool.name]);
            problems.push(...checkRequest(tool, rec, op));

            const a = tool.annotations;
            if (rec.method === "DELETE" || rec.path.endsWith("/delete")) {
                if (a.destructiveHint !== true)
                    problems.push("annotation:destructiveHint must be true");
            }
            if (rec.method === "GET" && a.readOnlyHint !== true) {
                problems.push("annotation:readOnlyHint must be true for GET");
            }
            if (rec.method !== "GET" && a.readOnlyHint === true) {
                problems.push("annotation:readOnlyHint must not be true for a mutation");
            }
        }
        expect(problems.filter((p) => !isKnown(tool.name, p))).toEqual([]);
    });
});

describe("spec coverage", () => {
    it("has every spec operation called by at least one tool", () => {
        const uncovered = [...spec.keys()].filter((k) => !called.has(k) && !(k in UNREACHABLE));
        expect(uncovered, `Uncovered operations:\n${uncovered.join("\n")}`).toEqual([]);
    });
});
