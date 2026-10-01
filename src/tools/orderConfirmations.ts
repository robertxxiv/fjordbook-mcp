import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, W, D, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

const date = (what: string) => z.string().describe(`${what}, format yyyy-mm-dd`);

// Request body shared by the invoice-ish draft endpoints (order confirmation, offer,
// credit note drafts). Also imported by offers.ts and creditNotes.ts.
export const draftSchema = z.object({
    type: z
        .enum([
            "invoice",
            "cash_invoice",
            "offer",
            "order_confirmation",
            "credit_note",
            "repeating_invoice",
        ])
        .describe(
            'Type of draft. Allowed values: invoice, cash_invoice, offer, order_confirmation, credit_note, repeating_invoice. Use "order_confirmation" for order confirmation drafts.',
        ),
    uuid: z
        .string()
        .optional()
        .describe(
            "UUID of the draft as 32 hexadecimal digits, displayed in 5 groups separated by hyphens",
        ),
    issueDate: date("Issue date of the draft").optional(),
    daysUntilDueDate: z.number().int().describe("Days until due date of the draft"),
    invoiceText: z
        .string()
        .optional()
        .describe("Comment/description printed above the document lines"),
    yourReference: z.string().optional(),
    ourReference: z.string().optional(),
    orderReference: z.string().optional().describe("Reference if sending via EHF"),
    lines: z
        .array(
            z.object({
                invoiceishDraftLineId: z
                    .number()
                    .int()
                    .optional()
                    .describe("Unique draft line ID (set when updating an existing line)"),
                lastModifiedDate: date("Date the draft line was last modified in Fiken").optional(),
                productId: z.number().int().optional().describe("ID of the product on this line"),
                description: z
                    .string()
                    .optional()
                    .describe("Description of the product or service"),
                unitPrice: z
                    .number()
                    .int()
                    .optional()
                    .describe("Net price per unit in document currency, in cents (øre)"),
                vatType: z
                    .string()
                    .optional()
                    .describe(
                        "VAT type for sales, e.g. NONE, HIGH, MEDIUM, RAW_FISH, LOW, EXEMPT, EXEMPT_IMPORT_EXPORT, EXEMPT_REVERSE",
                    ),
                quantity: z.number().describe("Number of units"),
                discount: z.number().optional().describe("Percentage discount on the line"),
                comment: z
                    .string()
                    .optional()
                    .describe("Additional information printed on the document"),
                incomeAccount: z
                    .string()
                    .optional()
                    .describe(
                        "Income account, e.g. 3000. Defaults to the product's income account",
                    ),
            }),
        )
        .optional(),
    currency: z.string().optional().describe('ISO 4217 currency code, e.g. "NOK"'),
    bankAccountNumber: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional(),
    paymentAccount: z.string().optional(),
    customerId: z
        .number()
        .int()
        .describe("Customer ID (contactId of a contact with customer = true)"),
    contactPersonId: z
        .number()
        .int()
        .optional()
        .describe("ID of the contact person; must belong to the given customer"),
    projectId: z.number().int().optional(),
    roundingType: z
        .enum(["none", "round_half", "round_whole", "round_down_half", "round_down_whole"])
        .optional()
        .describe(
            "Øre rounding applied to the total. Allowed values: none, round_half, round_whole, round_down_half, round_down_whole",
        ),
    startDate: date(
        "First issue date of the recurring invoice, only for repeating_invoice",
    ).optional(),
    endDate: date("Optional date after which no more recurring invoices are generated").optional(),
    frequency: z
        .object({
            interval: z.number().int().describe("Number of interval units between each invoice"),
            intervalUnit: z.enum(["DAY", "WEEK", "MONTH"]).describe("DAY, WEEK or MONTH"),
        })
        .optional()
        .describe("How often a recurring invoice is generated (repeating_invoice only)"),
});

// Request body shared by the send endpoints (offers, credit notes).
export const sendSchema = z.object({
    method: z
        .array(z.enum(["email", "ehf", "efaktura", "sms", "letter", "auto"]))
        .describe(
            "Sending methods in prioritized order; Fiken uses the first available one. Allowed values: email, ehf, efaktura, sms, letter, auto",
        ),
    includeDocumentAttachments: z
        .boolean()
        .describe(
            "Whether the document's attachments are included (not supported for method letter)",
        ),
    recipientName: z.string().optional(),
    recipientEmail: z.string().optional(),
    message: z.string().optional().describe("Additional message sent with the document"),
    emailSendOption: z
        .enum(["document_link", "attachment", "auto"])
        .optional()
        .describe("document_link, attachment or auto (default: customer/company settings)"),
    mergeInvoiceAndAttachments: z
        .boolean()
        .optional()
        .describe("With emailSendOption = attachment, merge them into one document"),
    organizationNumber: z
        .string()
        .optional()
        .describe("Brreg organization number; defaults to the customer's"),
    mobileNumber: z
        .string()
        .optional()
        .describe("Include country code; defaults to the customer's phone number"),
});

const pagination = {
    page: pageField,
    pageSize: pageSizeField,
};

const draftId = z.number().int().describe("Draft ID");

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_order_confirmations",
        {
            ...R,
            description: "Returns all order confirmations for the company" + PAGINATION_NOTE,
            inputSchema: z.object(pagination),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/orderConfirmations"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_order_confirmation",
        {
            ...R,
            description: "Returns a specific order confirmation by ID",
            inputSchema: z.object({
                confirmationId: z.number().int().describe("Order confirmation ID"),
            }),
        },
        async ({ confirmationId }) => {
            try {
                return ok(await get(cp(`/orderConfirmations/${confirmationId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_order_confirmation_counter",
        {
            ...R,
            description: "Retrieves the order confirmation number counter",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get(cp("/orderConfirmations/counter")));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_order_confirmation_counter",
        {
            ...W,
            description: "Creates the first order confirmation number counter",
            inputSchema: z.object({
                value: z.number().int().optional().describe("Current value of the counter"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/orderConfirmations/counter"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice_draft_from_order_confirmation",
        {
            ...W,
            description: "Creates an invoice draft from an order confirmation",
            inputSchema: z.object({
                confirmationId: z.number().int().describe("Order confirmation ID"),
            }),
        },
        async ({ confirmationId }) => {
            try {
                return ok(
                    await mutate(
                        "POST",
                        cp(`/orderConfirmations/${confirmationId}/createInvoiceDraft`),
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_order_confirmation_drafts",
        {
            ...R,
            description: "Returns all order confirmation drafts for the company" + PAGINATION_NOTE,
            inputSchema: z.object(pagination),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/orderConfirmations/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_order_confirmation_draft",
        {
            ...W,
            description:
                'Creates a new order confirmation draft (set type to "order_confirmation")',
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/orderConfirmations/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_order_confirmation_draft",
        {
            ...R,
            description: "Returns a specific order confirmation draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/orderConfirmations/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_order_confirmation_draft",
        {
            ...W,
            description: "Updates an order confirmation draft",
            inputSchema: z.object({ draftId, ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/orderConfirmations/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_order_confirmation_draft",
        {
            ...D,
            description: "Deletes an order confirmation draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/orderConfirmations/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_order_confirmation_from_draft",
        {
            ...W,
            description: "Creates a finalized order confirmation from a draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(
                    await mutate(
                        "POST",
                        cp(`/orderConfirmations/drafts/${draftId}/createOrderConfirmation`),
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );
}
