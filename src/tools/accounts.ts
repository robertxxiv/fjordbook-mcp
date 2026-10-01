import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, W, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

const accountCodeField = z
    .string()
    .regex(/^\d{4}(:\d+)?$/)
    .describe(
        'Account code: 4 digits, optionally ":" and a sub-account number, e.g. "3020" or "1500:10001"',
    );

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_accounts",
        {
            ...R,
            description: "Retrieves bookkeeping accounts for the current year" + PAGINATION_NOTE,
            inputSchema: z.object({
                fromAccount: z.number().int().optional().describe("First account number to return"),
                toAccount: z.number().int().optional().describe("Last account number to return"),
                range: z
                    .string()
                    .optional()
                    .describe(
                        'Comma-separated account numbers or ranges, e.g. "1000-1500, 1580-1999, 2000"',
                    ),
                page: pageField,
                pageSize: pageSizeField,
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/accounts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_account",
        {
            ...R,
            description: "Retrieves a specific bookkeeping account by account code",
            inputSchema: z.object({
                accountCode: accountCodeField,
            }),
        },
        async ({ accountCode }) => {
            try {
                return ok(await get(cp(`/accounts/${accountCode}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_account_balances",
        {
            ...R,
            description:
                "Retrieves accounts and closing balances for a given date" + PAGINATION_NOTE,
            inputSchema: z.object({
                date: z.string().describe("Date in YYYY-MM-DD format (required)"),
                fromAccount: z.number().int().optional().describe("First account number to return"),
                toAccount: z.number().int().optional().describe("Last account number to return"),
                page: pageField,
                pageSize: pageSizeField,
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/accountBalances"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_account_balance",
        {
            ...R,
            description: "Retrieves a specific account and its balance for a given date",
            inputSchema: z.object({
                accountCode: accountCodeField,
                date: z.string().describe("Date in YYYY-MM-DD format (required)"),
            }),
        },
        async ({ accountCode, date }) => {
            try {
                return ok(await get(cp(`/accountBalances/${accountCode}`), { date }));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_bank_accounts",
        {
            ...R,
            description: "Retrieves all bank accounts for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                inactive: z
                    .boolean()
                    .optional()
                    .describe(
                        "false = only active bank accounts, true = only inactive bank accounts",
                    ),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/bankAccounts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_bank_account",
        {
            ...W,
            description: "Creates a new bank account for the company",
            inputSchema: z.object({
                name: z.string().describe("Name of the bank account"),
                bankAccountNumber: z.string().describe("Bank account number"),
                iban: z.string().optional(),
                bic: z.string().optional(),
                foreignService: z.string().optional().describe("Name of the foreign bank service"),
                type: z
                    .enum(["normal", "tax_deduction", "foreign", "credit_card"])
                    .describe("Bank account type: normal, tax_deduction, foreign or credit_card"),
                inactive: z.boolean().optional(),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/bankAccounts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_bank_account",
        {
            ...R,
            description: "Retrieves a specific bank account by ID",
            inputSchema: z.object({
                bankAccountId: z.number().int().describe("Bank account ID"),
            }),
        },
        async ({ bankAccountId }) => {
            try {
                return ok(await get(cp(`/bankAccounts/${bankAccountId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_bank_balances",
        {
            ...R,
            description:
                "Retrieves bank balances for the company at a given date" + PAGINATION_NOTE,
            inputSchema: z.object({
                date: z.string().optional().describe("Date in YYYY-MM-DD format"),
                page: pageField,
                pageSize: pageSizeField,
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/bankBalances"), p));
            } catch (e) {
                return err(e);
            }
        },
    );
}
