import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import {
    R,
    W,
    D,
    ok,
    okList,
    err,
    pageField,
    pageSizeField,
    PAGINATION_NOTE,
    dateField,
} from "./shared.js";

const saleLine = z.object({
    description: z.string().describe("Description of the product or service"),
    vatType: z.string().describe('e.g. "HIGH", "NONE", "LOW"'),
    netPrice: z
        .number()
        .int()
        .optional()
        .describe("Net amount in cents (øre): 500000 = 5000.00 NOK"),
    vat: z.number().int().optional().describe("VAT amount in cents (øre): 125000 = 1250.00 NOK"),
    account: z
        .string()
        .optional()
        .describe('Account code, e.g. "3000"; must exist in the chart and be valid for vatType'),
    netPriceInCurrency: z
        .number()
        .int()
        .optional()
        .describe("Net amount in currency cents: 500000 = 5000.00"),
    vatInCurrency: z
        .number()
        .int()
        .optional()
        .describe("VAT amount in currency cents: 125000 = 1250.00"),
    projectId: z.number().int().optional(),
});

const paymentSchema = z.object({
    date: dateField().describe("Payment date YYYY-MM-DD"),
    account: z.string().describe('Payment account, e.g. "1920:10001"'),
    amount: z.number().int().describe("Amount paid in cents (øre): 500000 = 5000.00 NOK"),
    amountInNok: z
        .number()
        .int()
        .optional()
        .describe("NOK amount for foreign currency payments, in cents (øre): 500000 = 5000.00 NOK"),
    currency: z.string().optional().describe('ISO 4217, e.g. "NOK"'),
    fee: z.number().int().optional().describe("Payment fee in NOK cents (øre): 1500 = 15.00 NOK"),
});

const accrualSchema = z.object({
    lineId: z
        .number()
        .int()
        .describe(
            "The sale/purchase line (lineId) to accrue; must be on a result account (3000-7999)",
        ),
    startDate: dateField().describe("First period (month) of the accrual, YYYY-MM-DD"),
    periods: z.number().int().min(1).max(120).describe("Number of monthly periods (1-120)"),
    account: z
        .string()
        .describe(
            "Accrual balance account. Sales: 1530 or 2965. Purchases: 1397, 1700, 1710, 1742, 1743, 1744, 1749 or 2961",
        ),
});

const draftLine = z.object({
    text: z.string().describe("Description of the sale/purchase line"),
    vatType: z.string().describe('e.g. "HIGH", "NONE", "LOW"'),
    incomeAccount: z.string().describe('Account code, e.g. "3000"'),
    net: z.number().int().describe("Net amount in cents (øre): 500000 = 5000.00 NOK"),
    gross: z.number().int().describe("Gross amount in cents (øre): 625000 = 6250.00 NOK"),
    projectId: z.number().int().optional(),
});

const draftSchema = z.object({
    invoiceIssueDate: dateField().optional().describe("YYYY-MM-DD"),
    dueDate: dateField().optional().describe("YYYY-MM-DD"),
    invoiceNumber: z.string().optional(),
    contactId: z.number().int().optional().describe("Contact ID"),
    projectId: z.number().int().optional(),
    cash: z.boolean(),
    currency: z.string().optional().describe('ISO 4217, e.g. "NOK"'),
    kid: z.string().optional().describe("Norwegian KID number"),
    paid: z.boolean(),
    payments: z.array(paymentSchema).optional(),
    lines: z.array(draftLine),
});

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_sales",
        {
            ...R,
            description: "Returns all sales for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                date: dateField().optional().describe("Sale date equals, YYYY-MM-DD"),
                dateLe: dateField().optional().describe("Sale date <=, YYYY-MM-DD"),
                dateLt: dateField().optional().describe("Sale date <, YYYY-MM-DD"),
                dateGe: dateField().optional().describe("Sale date >=, YYYY-MM-DD"),
                dateGt: dateField().optional().describe("Sale date >, YYYY-MM-DD"),
                lastModified: dateField().optional().describe("Last modified equals, YYYY-MM-DD"),
                lastModifiedLe: dateField().optional().describe("Last modified <=, YYYY-MM-DD"),
                lastModifiedLt: dateField().optional().describe("Last modified <, YYYY-MM-DD"),
                lastModifiedGe: dateField().optional().describe("Last modified >=, YYYY-MM-DD"),
                lastModifiedGt: dateField().optional().describe("Last modified >, YYYY-MM-DD"),
                contactId: z.number().int().optional().describe("Customer contact ID"),
                settled: z.boolean().optional().describe("Filter on whether the sale is settled"),
                saleNumber: z.string().optional().describe("Filter on sale number"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/sales"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_sale",
        {
            ...W,
            description:
                "Creates a new sale. Amounts in NOK øre. Fiken enforces account/VAT combinations: the account must exist in the chart of accounts (e.g. 3000 accepts only vatType HIGH, 3100 only EXEMPT, 3200 only OUTSIDE), and cash sales (kind cash_sale) require paymentDate equal to date.",
            inputSchema: z.object({
                date: dateField().describe("Sale date YYYY-MM-DD"),
                kind: z
                    .enum(["cash_sale", "invoice", "external_invoice"])
                    .describe("Kind of sale: cash_sale, invoice or external_invoice"),
                totalPaid: z
                    .number()
                    .int()
                    .optional()
                    .describe("Total paid in cents (øre): 500000 = 5000.00 NOK"),
                totalPaidInCurrency: z
                    .number()
                    .int()
                    .optional()
                    .describe("Total paid in currency cents: 500000 = 5000.00"),
                currency: z.string().describe('ISO 4217, e.g. "NOK"'),
                saleNumber: z.string().optional(),
                customerId: z.number().int().optional().describe("Customer contact ID"),
                dueDate: dateField().optional().describe("YYYY-MM-DD"),
                kid: z.string().optional().describe("Norwegian KID number"),
                paymentDate: dateField().optional().describe("Payment date YYYY-MM-DD"),
                paymentFee: z
                    .number()
                    .int()
                    .optional()
                    .describe("Payment fee in NOK cents (øre): 1500 = 15.00 NOK"),
                paymentAccount: z
                    .string()
                    .optional()
                    .describe('Payment account, e.g. "1920:10001"'),
                projectId: z.number().int().optional(),
                lines: z.array(saleLine),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/sales"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale",
        {
            ...R,
            description: "Returns a specific sale by ID",
            inputSchema: z.object({ saleId: z.number().int() }),
        },
        async ({ saleId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_sale",
        {
            ...D,
            description:
                "Marks a sale as deleted. The sale is not removed; a reverse transaction is created and its deleted flag is set",
            inputSchema: z.object({
                saleId: z.number().int(),
                description: z.string().describe("Reason for deleting the sale"),
            }),
        },
        async ({ saleId, description }) => {
            try {
                return ok(
                    await mutate(
                        "PATCH",
                        `${cp(`/sales/${saleId}/delete`)}?description=${encodeURIComponent(description)}`,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_attachments",
        {
            ...R,
            description: "Returns all attachments for a sale",
            inputSchema: z.object({ saleId: z.number().int() }),
        },
        async ({ saleId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_sale_drafts",
        {
            ...R,
            description: "Returns all sale drafts for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/sales/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_sale_draft",
        {
            ...W,
            description: "Creates a new sale draft",
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/sales/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_draft",
        {
            ...R,
            description: "Returns a specific sale draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/sales/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_sale_draft",
        {
            ...D,
            description:
                "Updates a sale draft. Replaces the whole record: send every field you want to keep.",
            inputSchema: z.object({ draftId: z.number().int(), ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/sales/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_sale_draft",
        {
            ...D,
            description: "Deletes a sale draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/sales/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_draft_attachments",
        {
            ...R,
            description: "Returns all attachments for a sale draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/sales/drafts/${draftId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_sale_from_draft",
        {
            ...W,
            description: "Creates a finalized sale from a draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("POST", cp(`/sales/drafts/${draftId}/createSale`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_settle_sale",
        {
            ...D,
            description:
                'Marks a sale as settled without payment ("sett til oppgjort uten betaling"). Send a new settledDate to change the settlement date',
            inputSchema: z.object({
                saleId: z.number().int(),
                settledDate: dateField().describe("Settlement date YYYY-MM-DD"),
            }),
        },
        async ({ saleId, settledDate }) => {
            try {
                return ok(
                    await mutate(
                        "PATCH",
                        `${cp(`/sales/${saleId}/settled`)}?settledDate=${encodeURIComponent(settledDate)}`,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_write_off_sale",
        {
            ...D,
            description:
                "Registers a write-off (tapsføring) for a sale. The sale must not be a cash sale, already written off, settled or deleted, and must have an outstanding balance. The write-off date must be after the sale date",
            inputSchema: z.object({
                saleId: z.number().int(),
                type: z
                    .enum([
                        "OVERDUE_6_MONTHS",
                        "COLLECTION_FAILED",
                        "CUSTOMER_BANKRUPTCY",
                        "DEEMED_IRRECOVERABLE",
                    ])
                    .describe(
                        "Reason: OVERDUE_6_MONTHS (6+ months past due and 3+ reminders sent), COLLECTION_FAILED (debt collection unsuccessful), CUSTOMER_BANKRUPTCY, DEEMED_IRRECOVERABLE (overall assessment)",
                    ),
                date: dateField().describe(
                    "Write-off date YYYY-MM-DD, must be after the sale date",
                ),
                comment: z.string().max(200).optional().describe("Optional comment, max 200 chars"),
            }),
        },
        async ({ saleId, ...body }) => {
            try {
                return ok(await mutate("PATCH", cp(`/sales/${saleId}/writeOff`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_payments",
        {
            ...R,
            description: "Returns all payments for a sale",
            inputSchema: z.object({ saleId: z.number().int() }),
        },
        async ({ saleId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}/payments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_sale_payment",
        {
            ...W,
            description: "Creates a new payment for a sale. Amounts in cents",
            inputSchema: z.object({ saleId: z.number().int(), ...paymentSchema.shape }),
        },
        async ({ saleId, ...body }) => {
            try {
                return ok(await mutate("POST", cp(`/sales/${saleId}/payments`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_payment",
        {
            ...R,
            description: "Returns a specific payment on a sale",
            inputSchema: z.object({ saleId: z.number().int(), paymentId: z.number().int() }),
        },
        async ({ saleId, paymentId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}/payments/${paymentId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_sale_payment",
        {
            ...D,
            description:
                'Undoes a payment on a sale ("Angre"). An open payment is deleted; a closed one gets a reverse transaction. Fails if already deleted, on a written-off sale, or related to debt collection',
            inputSchema: z.object({
                saleId: z.number().int(),
                paymentId: z.number().int(),
                description: z
                    .string()
                    .optional()
                    .describe("Optional description used when the payment is reversed"),
            }),
        },
        async ({ saleId, paymentId, description }) => {
            try {
                const path = cp(`/sales/${saleId}/payments/${paymentId}`);
                return ok(
                    await mutate(
                        "DELETE",
                        description === undefined
                            ? path
                            : `${path}?description=${encodeURIComponent(description)}`,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_accruals",
        {
            ...R,
            description: "Returns all accruals (periodisering) set up on a sale",
            inputSchema: z.object({ saleId: z.number().int() }),
        },
        async ({ saleId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}/accruals`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_sale_accrual",
        {
            ...W,
            description:
                "Sets up an accrual for one line on a sale, spreading the line amount evenly over monthly periods. Only lines on result accounts (3000-7999) can be accrued; sales with sales-cost lines are not supported",
            inputSchema: z.object({ saleId: z.number().int(), ...accrualSchema.shape }),
        },
        async ({ saleId, ...body }) => {
            try {
                return ok(await mutate("POST", cp(`/sales/${saleId}/accruals`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_sale_accrual",
        {
            ...R,
            description: "Returns a specific accrual on a sale",
            inputSchema: z.object({ saleId: z.number().int(), accrualId: z.number().int() }),
        },
        async ({ saleId, accrualId }) => {
            try {
                return ok(await get(cp(`/sales/${saleId}/accruals/${accrualId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_sale_accrual",
        {
            ...D,
            description: "Deletes an accrual on a sale",
            inputSchema: z.object({ saleId: z.number().int(), accrualId: z.number().int() }),
        },
        async ({ saleId, accrualId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/sales/${saleId}/accruals/${accrualId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}
