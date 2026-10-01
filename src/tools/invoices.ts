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

const invoiceLine = z.object({
    net: z.number().int().optional().describe("Net amount in cents"),
    vat: z.number().int().optional().describe("VAT amount in cents"),
    vatType: z
        .string()
        .optional()
        .describe('VAT type, e.g. "HIGH", "NONE", "LOW", "EXEMPT_IMPORT_EXPORT"'),
    gross: z.number().int().optional().describe("Gross amount in cents"),
    vatInPercent: z.number().optional().describe("VAT percentage from 0 to 100"),
    unitPrice: z.number().int().optional().describe("Unit price in cents"),
    quantity: z.number(),
    discount: z.number().optional().describe("Discount percentage"),
    productName: z.string().optional(),
    productId: z.number().int().optional(),
    description: z.string().optional(),
    comment: z.string().optional(),
    incomeAccount: z
        .string()
        .optional()
        .describe('Income account, e.g. "3000"; must match vatType (3000 only HIGH)'),
});

export const draftLine = z.object({
    productId: z.number().int().optional().describe("Product ID to put on the line"),
    description: z.string().max(200).optional().describe("Description of the product or service"),
    unitPrice: z.number().int().optional().describe("Net price per unit in cents"),
    vatType: z
        .string()
        .optional()
        .describe(
            "VAT type for sales: NONE, HIGH, MEDIUM, RAW_FISH, LOW, EXEMPT_IMPORT_EXPORT, EXEMPT, OUTSIDE, EXEMPT_REVERSE",
        ),
    quantity: z.number().describe("Number of units"),
    discount: z.number().optional().describe("Discount percentage, 0 to 100 (decimals allowed)"),
    comment: z.string().max(200).optional().describe("Additional text printed on the invoice"),
    incomeAccount: z.string().optional().describe('Income account, e.g. "3000"'),
});

export const frequency = z
    .object({
        interval: z
            .number()
            .int()
            .min(1)
            .describe("Number of interval units between each generated invoice (minimum 1)"),
        intervalUnit: z.enum(["DAY", "WEEK", "MONTH"]).describe("Unit of the interval"),
    })
    .describe("How often an invoice is generated, e.g. interval 1 + MONTH = monthly");

const roundingType = z
    .enum(["none", "round_half", "round_whole", "round_down_half", "round_down_whole"])
    .optional()
    .describe(
        "Øre rounding of the total (NOK only): none (default), round_half, round_whole, round_down_half, round_down_whole",
    );

const draftSchema = z.object({
    type: z
        .enum([
            "invoice",
            "cash_invoice",
            "offer",
            "order_confirmation",
            "credit_note",
            "repeating_invoice",
        ])
        .describe("Type of draft"),
    uuid: z.string().optional(),
    issueDate: dateField().optional().describe("YYYY-MM-DD"),
    daysUntilDueDate: z.number().int(),
    invoiceText: z.string().optional(),
    yourReference: z.string().optional(),
    ourReference: z.string().optional(),
    orderReference: z.string().optional(),
    lines: z.array(draftLine).optional(),
    currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional()
        .describe('ISO 4217, e.g. "NOK"'),
    bankAccountNumber: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional(),
    paymentAccount: z.string().optional().describe("Account code for payment"),
    customerId: z.number().int().describe("Customer contact ID"),
    contactPersonId: z.number().int().optional(),
    projectId: z.number().int().optional(),
    roundingType,
    startDate: dateField()
        .optional()
        .describe("YYYY-MM-DD. First issue date; required only when type is repeating_invoice"),
    endDate: dateField()
        .optional()
        .describe("YYYY-MM-DD. Optional last date; only for type repeating_invoice"),
    frequency: frequency.optional().describe("Only for type repeating_invoice"),
});

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_invoices",
        {
            ...R,
            description: "Returns all invoices for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                issueDate: dateField().optional().describe("YYYY-MM-DD"),
                issueDateLe: dateField().optional(),
                issueDateLt: dateField().optional(),
                issueDateGe: dateField().optional(),
                issueDateGt: dateField().optional(),
                lastModified: dateField().optional(),
                lastModifiedLe: dateField().optional(),
                lastModifiedLt: dateField().optional(),
                lastModifiedGe: dateField().optional(),
                lastModifiedGt: dateField().optional(),
                dueDate: dateField().optional().describe("YYYY-MM-DD"),
                dueDateLe: dateField().optional().describe("YYYY-MM-DD"),
                dueDateLt: dateField().optional().describe("YYYY-MM-DD"),
                dueDateGe: dateField().optional().describe("YYYY-MM-DD"),
                dueDateGt: dateField().optional().describe("YYYY-MM-DD"),
                customerId: z.number().int().optional(),
                settled: z.boolean().optional(),
                orderReference: z.string().optional(),
                invoiceDraftUuid: z
                    .string()
                    .optional()
                    .describe("UUID of the invoice draft the invoice was created from"),
                invoiceNumber: z.string().optional(),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/invoices"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice",
        {
            ...W,
            description:
                "Creates a new invoice. Amounts are in NOK øre (cents). Each line's incomeAccount must exist in the chart of accounts and match its vatType (e.g. 3000 accepts only HIGH, 3100 only EXEMPT, 3200 only OUTSIDE).",
            inputSchema: z.object({
                uuid: z.string().optional(),
                issueDate: dateField().describe("Issue date YYYY-MM-DD (required)"),
                dueDate: dateField().describe("Due date YYYY-MM-DD"),
                lines: z.array(invoiceLine).min(1).describe("Invoice line items (at least one)"),
                customerId: z.number().int().describe("Contact ID of the customer"),
                bankAccountCode: z.string().describe("Bank account code, format 1920:XXXXX"),
                cash: z.boolean().describe("True if paid immediately by cash"),
                ourReference: z.string().optional(),
                yourReference: z.string().optional(),
                orderReference: z.string().optional(),
                contactPersonId: z.number().int().optional(),
                currency: z
                    .string()
                    .regex(/^[A-Z]{3}$/)
                    .optional()
                    .describe('ISO 4217, e.g. "NOK" (default NOK)'),
                invoiceText: z.string().max(500).optional(),
                paymentAccount: z
                    .string()
                    .optional()
                    .describe("Account code for cash invoices, e.g. 1920:10001"),
                projectId: z.number().int().optional(),
                roundingType,
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/invoices"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_invoice",
        {
            ...R,
            description: "Returns a specific invoice by ID",
            inputSchema: z.object({
                invoiceId: z.number().int(),
            }),
        },
        async ({ invoiceId }) => {
            try {
                return ok(await get(cp(`/invoices/${invoiceId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_invoice",
        {
            ...W,
            description: "Updates an invoice (due date and/or manual send status)",
            inputSchema: z.object({
                invoiceId: z.number().int(),
                newDueDate: dateField().optional().describe("New due date YYYY-MM-DD"),
                sentManually: z.boolean().optional().describe("Mark invoice as manually sent"),
            }),
        },
        async ({ invoiceId, ...body }) => {
            try {
                return ok(await mutate("PATCH", cp(`/invoices/${invoiceId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_invoice_attachments",
        {
            ...R,
            description: "Returns all attachments for an invoice",
            inputSchema: z.object({
                invoiceId: z.number().int(),
            }),
        },
        async ({ invoiceId }) => {
            try {
                return ok(await get(cp(`/invoices/${invoiceId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_send_invoice",
        {
            ...W,
            description: "Sends an invoice via email and/or EHF",
            inputSchema: z.object({
                invoiceId: z.number().int(),
                method: z
                    .array(z.enum(["email", "ehf", "efaktura", "sms", "letter", "auto"]))
                    .describe("Delivery methods"),
                includeDocumentAttachments: z.boolean(),
                recipientName: z.string().optional(),
                recipientEmail: z.string().optional(),
                message: z.string().optional(),
                emailSendOption: z.enum(["document_link", "attachment", "auto"]).optional(),
                mergeInvoiceAndAttachments: z.boolean().optional(),
                organizationNumber: z.string().optional(),
                mobileNumber: z.string().optional(),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/invoices/send"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_invoice_counter",
        {
            ...R,
            description: "Retrieves the current invoice number counter",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get(cp("/invoices/counter")));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice_counter",
        {
            ...W,
            description: "Creates the first invoice number counter",
            inputSchema: z.object({
                value: z.number().int().optional().describe("Starting invoice number"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/invoices/counter"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_invoice_drafts",
        {
            ...R,
            description: "Returns all invoice drafts for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                orderReference: z.string().optional(),
                uuid: z.string().optional(),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/invoices/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice_draft",
        {
            ...W,
            description: "Creates a new invoice draft",
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/invoices/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_invoice_draft",
        {
            ...R,
            description: "Returns a specific invoice draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/invoices/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_invoice_draft",
        {
            ...D,
            description:
                "Updates an existing invoice draft. Replaces the whole record: send every field you want to keep.",
            inputSchema: z.object({ draftId: z.number().int(), ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/invoices/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_invoice_draft",
        {
            ...D,
            description: "Deletes an invoice draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/invoices/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_invoice_draft_attachments",
        {
            ...R,
            description: "Returns all attachments for an invoice draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/invoices/drafts/${draftId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_recurring_invoice_from_draft",
        {
            ...W,
            description:
                "Creates a recurring invoice from an existing draft of type repeating_invoice (activates it)",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(
                    await mutate("POST", cp(`/invoices/drafts/${draftId}/createRecurringInvoice`)),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice_from_draft",
        {
            ...W,
            description: "Creates a finalized invoice from a draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("POST", cp(`/invoices/drafts/${draftId}/createInvoice`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}
