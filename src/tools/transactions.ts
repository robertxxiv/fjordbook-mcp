import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import {
    R,
    D,
    ok,
    okList,
    err,
    pageField,
    pageSizeField,
    PAGINATION_NOTE,
    dateField,
} from "./shared.js";

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_transactions",
        {
            ...R,
            description: "Returns all transactions for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                lastModified: dateField()
                    .optional()
                    .describe("Last modified on, format YYYY-MM-DD"),
                lastModifiedLe: dateField()
                    .optional()
                    .describe("Last modified on or before, format YYYY-MM-DD"),
                lastModifiedLt: dateField()
                    .optional()
                    .describe("Last modified strictly before, format YYYY-MM-DD"),
                lastModifiedGe: dateField()
                    .optional()
                    .describe("Last modified on or after, format YYYY-MM-DD"),
                lastModifiedGt: dateField()
                    .optional()
                    .describe("Last modified strictly after, format YYYY-MM-DD"),
                createdDate: dateField().optional().describe("Created on, format YYYY-MM-DD"),
                createdDateLe: dateField()
                    .optional()
                    .describe("Created on or before, format YYYY-MM-DD"),
                createdDateLt: dateField()
                    .optional()
                    .describe("Created strictly before, format YYYY-MM-DD"),
                createdDateGe: dateField()
                    .optional()
                    .describe("Created on or after, format YYYY-MM-DD"),
                createdDateGt: dateField()
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
