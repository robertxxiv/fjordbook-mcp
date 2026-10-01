import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, W, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_journal_entries",
        {
            ...R,
            description: "Returns all general journal entries for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                date: z.string().optional().describe("Date equal to, format YYYY-MM-DD"),
                dateLe: z.string().optional().describe("Date on or before, format YYYY-MM-DD"),
                dateLt: z.string().optional().describe("Date strictly before, format YYYY-MM-DD"),
                dateGe: z.string().optional().describe("Date on or after, format YYYY-MM-DD"),
                dateGt: z.string().optional().describe("Date strictly after, format YYYY-MM-DD"),
                lastModified: z.string().optional().describe("Last modified on, format YYYY-MM-DD"),
                lastModifiedLe: z
                    .string()
                    .optional()
                    .describe("Last modified on or before, format YYYY-MM-DD"),
                lastModifiedLt: z
                    .string()
                    .optional()
                    .describe("Last modified strictly before, format YYYY-MM-DD"),
                lastModifiedGe: z
                    .string()
                    .optional()
                    .describe("Last modified on or after, format YYYY-MM-DD"),
                lastModifiedGt: z
                    .string()
                    .optional()
                    .describe("Last modified strictly after, format YYYY-MM-DD"),
                createdDate: z.string().optional().describe("Created on, format YYYY-MM-DD"),
                createdDateLe: z
                    .string()
                    .optional()
                    .describe("Created on or before, format YYYY-MM-DD"),
                createdDateLt: z
                    .string()
                    .optional()
                    .describe("Created strictly before, format YYYY-MM-DD"),
                createdDateGe: z
                    .string()
                    .optional()
                    .describe("Created on or after, format YYYY-MM-DD"),
                createdDateGt: z
                    .string()
                    .optional()
                    .describe("Created strictly after, format YYYY-MM-DD"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/journalEntries"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_journal_entry",
        {
            ...R,
            description: "Returns a specific journal entry by ID",
            inputSchema: z.object({ journalEntryId: z.number().int() }),
        },
        async ({ journalEntryId }) => {
            try {
                return ok(await get(cp(`/journalEntries/${journalEntryId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_journal_entry_attachments",
        {
            ...R,
            description: "Returns all attachments for a journal entry",
            inputSchema: z.object({ journalEntryId: z.number().int() }),
        },
        async ({ journalEntryId }) => {
            try {
                return ok(await get(cp(`/journalEntries/${journalEntryId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_journal_entry",
        {
            ...W,
            description: "Creates a new general journal entry. Amounts are in NOK øre (cents).",
            inputSchema: z.object({
                description: z
                    .string()
                    .optional()
                    .describe("Description of the general journal entry as a whole"),
                open: z
                    .boolean()
                    .optional()
                    .describe("Whether the entry is left open (default false = closed)"),
                journalEntries: z
                    .array(
                        z.object({
                            description: z.string().describe("Description of the journal entry"),
                            date: z.string().describe("Date YYYY-MM-DD"),
                            lines: z
                                .array(
                                    z.object({
                                        amount: z
                                            .number()
                                            .int()
                                            .describe(
                                                "Amount in NOK øre: net (excl. VAT) for debitAccount lines, gross (incl. VAT) for creditAccount lines",
                                            ),
                                        account: z
                                            .string()
                                            .optional()
                                            .describe('Account code, e.g. "3000"'),
                                        vatCode: z
                                            .string()
                                            .optional()
                                            .describe("VAT code for account"),
                                        debitAccount: z
                                            .string()
                                            .optional()
                                            .describe("Account code to debit"),
                                        debitVatCode: z
                                            .number()
                                            .int()
                                            .optional()
                                            .describe("VAT code for the debit account"),
                                        creditAccount: z
                                            .string()
                                            .optional()
                                            .describe("Account code to credit"),
                                        creditVatCode: z
                                            .number()
                                            .int()
                                            .optional()
                                            .describe("VAT code for the credit account"),
                                        projectId: z
                                            .array(z.number().int())
                                            .optional()
                                            .describe(
                                                "IDs of projects the line is associated with",
                                            ),
                                    }),
                                )
                                .describe("Journal entry lines"),
                        }),
                    )
                    .describe("Journal entries"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/generalJournalEntries"), body));
            } catch (e) {
                return err(e);
            }
        },
    );
}
