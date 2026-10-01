import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, D, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_transactions",
        {
            ...R,
            description: "Returns all transactions for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
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
                return okList(await getWithMeta(cp("/transactions"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_transaction",
        {
            ...R,
            description: "Returns a specific transaction by ID",
            inputSchema: z.object({ transactionId: z.number().int() }),
        },
        async ({ transactionId }) => {
            try {
                return ok(await get(cp(`/transactions/${transactionId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_transaction",
        {
            ...D,
            description: "Marks a transaction as deleted and creates a reversing transaction",
            inputSchema: z.object({
                transactionId: z.number().int(),
                description: z.string().describe("Reason for deletion (required by API)"),
            }),
        },
        async ({ transactionId, description }) => {
            const path = `${cp(`/transactions/${transactionId}/delete`)}?description=${encodeURIComponent(description)}`;
            try {
                return ok(await mutate("PATCH", path));
            } catch (e) {
                return err(e);
            }
        },
    );
}
