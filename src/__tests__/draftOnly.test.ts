import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { draftOnlyEnabled, draftOnlyServer } from "../draftOnly.js";
import { register as registerInvoices } from "../tools/invoices.js";
import { register as registerPurchases } from "../tools/purchases.js";
import { register as registerTransactions } from "../tools/transactions.js";
import { register as registerJournalEntries } from "../tools/journalEntries.js";
import { TOOLSETS } from "../toolsets.js";

describe("draft-only configuration", () => {
    it("defaults on and rejects ambiguous values", () => {
        expect(draftOnlyEnabled(undefined)).toBe(true);
        expect(draftOnlyEnabled("")).toBe(true);
        expect(draftOnlyEnabled("false")).toBe(false);
        expect(draftOnlyEnabled("true")).toBe(true);
        expect(() => draftOnlyEnabled("TRUE")).toThrow("FIKEN_DRAFT_ONLY");
    });

    it("registers reads and draft preparation, never posting or deletion tools", () => {
        const names: string[] = [];
        const server = {
            registerTool: vi.fn((name: string) => names.push(name)),
        } as unknown as McpServer;
        const limited = draftOnlyServer(server);
        registerInvoices(limited);
        registerPurchases(limited);
        registerTransactions(limited);
        registerJournalEntries(limited);

        expect(names).toContain("fiken_list_transactions");
        expect(names).toContain("fiken_create_invoice_draft");
        expect(names).toContain("fiken_update_invoice_draft");
        expect(names).toContain("fiken_create_purchase_draft");
        expect(names).not.toContain("fiken_create_invoice");
        expect(names).not.toContain("fiken_create_invoice_from_draft");
        expect(names).not.toContain("fiken_create_purchase_from_draft");
        expect(names).not.toContain("fiken_create_journal_entry");
        expect(names).not.toContain("fiken_delete_transaction");
        expect(names).not.toContain("fiken_delete_invoice_draft");
    });

    it("limits every toolset to read and draft preparation tools", () => {
        const names: string[] = [];
        const server = { registerTool: (name: string) => names.push(name) } as unknown as McpServer;
        const limited = draftOnlyServer(server);
        for (const register of Object.values(TOOLSETS)) register(limited);
        expect(names.length).toBeGreaterThan(90);
        expect(names).toContain("fiken_add_purchase_draft_attachment");
        expect(names).toContain("fiken_create_credit_note_draft");
        expect(names).not.toContain("fiken_create_sale_from_draft");
        for (const name of names) {
            const isRead = /^fiken_(list|get)_/.test(name);
            const isDraftWrite = /^fiken_(create|update)_.*_draft$/.test(name);
            const isDraftAttachment = /^fiken_add_.*_draft_attachment$/.test(name);
            expect(isRead || isDraftWrite || isDraftAttachment, name).toBe(true);
        }
    });
});
