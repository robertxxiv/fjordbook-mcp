import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp, uploadMultipart } from "../client.js";
import { R, W, D, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";
import {
    UPLOAD_ENV_NOTE,
    exactlyOneSource,
    loadUpload,
    parseInput,
    refinedInput,
} from "./upload.js";

const purchaseLine = z.object({
    description: z.string().describe("Description of the product or service"),
    vatType: z.string().describe('e.g. "HIGH", "NONE", "LOW"'),
    netPrice: z.number().int().optional().describe("Net amount in cents"),
    vat: z
        .number()
        .int()
        .optional()
        .describe("VAT amount in cents (øre), e.g. 500000 = 5000.00 NOK"),
    account: z
        .string()
        .optional()
        .describe('Account code, e.g. "6540"; must exist in the chart and be valid for vatType'),
    netPriceInCurrency: z.number().int().optional().describe("Net amount in currency cents"),
    vatInCurrency: z.number().int().optional().describe("VAT amount in currency cents"),
    projectId: z.number().int().optional(),
});

const paymentSchema = z.object({
    date: z.string().describe("Payment date YYYY-MM-DD"),
    account: z.string().describe('Payment account, e.g. "1920:10001"'),
    amount: z.number().int().describe("Amount paid in cents"),
    amountInNok: z
        .number()
        .int()
        .optional()
        .describe(
            "NOK amount for foreign currency payments, in cents (øre), e.g. 500000 = 5000.00 NOK",
        ),
    currency: z.string().optional().describe('ISO 4217, e.g. "NOK"'),
    fee: z.number().int().optional().describe("Payment fee in NOK cents"),
});

const accrualSchema = z.object({
    lineId: z
        .number()
        .int()
        .describe(
            "The sale/purchase line (lineId) to accrue; must be on a result account (3000-7999)",
        ),
    startDate: z.string().describe("First period (month) of the accrual, YYYY-MM-DD"),
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
    net: z.number().int().describe("Net amount in cents"),
    gross: z.number().int().describe("Gross amount in cents"),
    projectId: z.number().int().optional(),
});

const draftSchema = z.object({
    invoiceIssueDate: z.string().optional().describe("YYYY-MM-DD"),
    dueDate: z.string().optional().describe("YYYY-MM-DD"),
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

const { input: attachmentSchema, validated: validatedAttachment } = refinedInput(
    z.object({
        purchaseId: z.number().int(),
        filename: z
            .string()
            .optional()
            .describe(
                "Filename for the attachment. Must end with .png, .jpeg, .jpg, .gif, or .pdf",
            ),
        filePath: z.string().optional().describe("Local path to the attachment file"),
        fileBase64: z.string().optional().describe("Base64-encoded attachment file contents"),
        ehfDocumentId: z
            .number()
            .int()
            .optional()
            .describe("Attach an existing received EHF document instead of uploading a file"),
        inboxDocumentId: z
            .number()
            .int()
            .optional()
            .describe("Attach an existing inbox document instead of uploading a file"),
        attachToPayment: z
            .boolean()
            .optional()
            .describe("True if the attachment documents the payment (e.g. bank/card receipt)"),
        attachToSale: z
            .boolean()
            .optional()
            .describe("True if the attachment documents the purchase (e.g. invoice)"),
    }),
    (value, ctx) => {
        exactlyOneSource(true)(value, ctx);
        if (!value.attachToPayment && !value.attachToSale) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one of attachToPayment or attachToSale must be true",
            });
        }
    },
);

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_purchases",
        {
            ...R,
            description: "Returns all purchases for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                date: z.string().optional().describe("Purchase date equals, YYYY-MM-DD"),
                dateLe: z.string().optional().describe("Purchase date <=, YYYY-MM-DD"),
                dateLt: z.string().optional().describe("Purchase date <, YYYY-MM-DD"),
                dateGe: z.string().optional().describe("Purchase date >=, YYYY-MM-DD"),
                dateGt: z.string().optional().describe("Purchase date >, YYYY-MM-DD"),
                lastModified: z.string().optional().describe("Last modified equals, YYYY-MM-DD"),
                lastModifiedLe: z.string().optional().describe("Last modified <=, YYYY-MM-DD"),
                lastModifiedLt: z.string().optional().describe("Last modified <, YYYY-MM-DD"),
                lastModifiedGe: z.string().optional().describe("Last modified >=, YYYY-MM-DD"),
                lastModifiedGt: z.string().optional().describe("Last modified >, YYYY-MM-DD"),
                sortBy: z
                    .enum(["date asc", "date desc"])
                    .optional()
                    .describe('Sort order: "date asc" (default) or "date desc"'),
                paid: z.boolean().optional().describe("Filter on whether the purchase is paid"),
                settledDate: z.string().optional().describe("Settled date equals, YYYY-MM-DD"),
                settledDateLe: z.string().optional().describe("Settled date <=, YYYY-MM-DD"),
                settledDateLt: z.string().optional().describe("Settled date <, YYYY-MM-DD"),
                settledDateGe: z.string().optional().describe("Settled date >=, YYYY-MM-DD"),
                settledDateGt: z.string().optional().describe("Settled date >, YYYY-MM-DD"),
                contactId: z.number().int().optional().describe("Supplier contact ID"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/purchases"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_purchase",
        {
            ...W,
            description:
                "Creates a new purchase. Amounts in NOK øre. Fiken enforces account/VAT combinations: the account must exist in the chart of accounts (e.g. 7350 accepts only vatType NONE), and cash purchases (paid immediately) require paymentDate equal to date.",
            inputSchema: z.object({
                identifier: z.string().optional().describe("Invoice/sale number or similar"),
                date: z.string().describe("Purchase date YYYY-MM-DD"),
                dueDate: z.string().optional().describe("Due date YYYY-MM-DD"),
                kind: z
                    .enum(["cash_purchase", "supplier"])
                    .describe("Purchased with cash or through a supplier"),
                lines: z.array(purchaseLine),
                supplierId: z.number().int().optional().describe("Supplier contact ID"),
                currency: z.string().describe('ISO 4217, e.g. "NOK"'),
                paymentAccount: z
                    .string()
                    .optional()
                    .describe('Payment account, e.g. "1920:10001"'),
                paymentDate: z.string().optional().describe("Payment date YYYY-MM-DD"),
                paymentAmountInNok: z
                    .number()
                    .int()
                    .optional()
                    .describe("Required for foreign currency payment; cents in NOK"),
                kid: z.string().optional().describe("Norwegian KID number"),
                projectId: z.number().int().optional(),
                paid: z.boolean(),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/purchases"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase",
        {
            ...R,
            description: "Returns a specific purchase by ID",
            inputSchema: z.object({ purchaseId: z.number().int() }),
        },
        async ({ purchaseId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_purchase",
        {
            ...D,
            description:
                "Marks a purchase as deleted. The purchase is not removed; a reverse transaction is created",
            inputSchema: z.object({
                purchaseId: z.number().int(),
                description: z.string().describe("Reason for deleting the purchase"),
            }),
        },
        async ({ purchaseId, description }) => {
            try {
                return ok(
                    await mutate(
                        "PATCH",
                        `${cp(`/purchases/${purchaseId}/delete`)}?description=${encodeURIComponent(description)}`,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_attachments",
        {
            ...R,
            description: "Returns all attachments for a purchase",
            inputSchema: z.object({ purchaseId: z.number().int() }),
        },
        async ({ purchaseId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_add_purchase_attachment",
        {
            ...W,
            description:
                "Creates and adds a new attachment to a purchase. Provide exactly one source: filePath, fileBase64, ehfDocumentId or inboxDocumentId. At least one of attachToPayment and attachToSale must be true. " +
                UPLOAD_ENV_NOTE,
            inputSchema: attachmentSchema,
        },
        async (rawInput) => {
            try {
                const {
                    purchaseId,
                    filename,
                    filePath,
                    fileBase64,
                    ehfDocumentId,
                    inboxDocumentId,
                    attachToPayment,
                    attachToSale,
                } = parseInput(validatedAttachment, rawInput);
                const form = new FormData();
                if (ehfDocumentId === undefined && inboxDocumentId === undefined) {
                    const { filename: name, blob } = await loadUpload({
                        filename,
                        filePath,
                        fileBase64,
                    });
                    form.append("filename", name);
                    form.append("file", blob, name);
                }

                return ok(
                    await uploadMultipart(
                        cp(`/purchases/${purchaseId}/attachments`),
                        { attachToPayment, attachToSale, ehfDocumentId, inboxDocumentId },
                        form,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_purchase_drafts",
        {
            ...R,
            description: "Returns all purchase drafts for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/purchases/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_purchase_draft",
        {
            ...W,
            description: "Creates a new purchase draft",
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/purchases/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_draft",
        {
            ...R,
            description: "Returns a specific purchase draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/purchases/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_purchase_draft",
        {
            ...W,
            description: "Updates a purchase draft",
            inputSchema: z.object({ draftId: z.number().int(), ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/purchases/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_purchase_draft",
        {
            ...D,
            description: "Deletes a purchase draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/purchases/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_draft_attachments",
        {
            ...R,
            description: "Returns all attachments for a purchase draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/purchases/drafts/${draftId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_purchase_from_draft",
        {
            ...W,
            description: "Creates a finalized purchase from a draft",
            inputSchema: z.object({ draftId: z.number().int() }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("POST", cp(`/purchases/drafts/${draftId}/createPurchase`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_payments",
        {
            ...R,
            description: "Returns all payments for a purchase",
            inputSchema: z.object({ purchaseId: z.number().int() }),
        },
        async ({ purchaseId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}/payments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_purchase_payment",
        {
            ...W,
            description: "Creates a new payment for a purchase. Amounts in cents",
            inputSchema: z.object({ purchaseId: z.number().int(), ...paymentSchema.shape }),
        },
        async ({ purchaseId, ...body }) => {
            try {
                return ok(await mutate("POST", cp(`/purchases/${purchaseId}/payments`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_payment",
        {
            ...R,
            description: "Returns a specific payment on a purchase",
            inputSchema: z.object({ purchaseId: z.number().int(), paymentId: z.number().int() }),
        },
        async ({ purchaseId, paymentId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}/payments/${paymentId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_purchase_payment",
        {
            ...D,
            description:
                'Undoes a payment on a purchase ("Angre"). An open payment is deleted; a closed one gets a reverse transaction',
            inputSchema: z.object({
                purchaseId: z.number().int(),
                paymentId: z.number().int(),
                description: z
                    .string()
                    .optional()
                    .describe("Optional description used when the payment is reversed"),
            }),
        },
        async ({ purchaseId, paymentId, description }) => {
            try {
                const path = cp(`/purchases/${purchaseId}/payments/${paymentId}`);
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
        "fiken_get_purchase_accruals",
        {
            ...R,
            description: "Returns all accruals (periodisering) set up on a purchase",
            inputSchema: z.object({ purchaseId: z.number().int() }),
        },
        async ({ purchaseId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}/accruals`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_purchase_accrual",
        {
            ...W,
            description:
                "Sets up an accrual for one line on a purchase, spreading the line amount evenly over monthly periods. Only lines on result accounts (3000-7999) can be accrued",
            inputSchema: z.object({ purchaseId: z.number().int(), ...accrualSchema.shape }),
        },
        async ({ purchaseId, ...body }) => {
            try {
                return ok(await mutate("POST", cp(`/purchases/${purchaseId}/accruals`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_purchase_accrual",
        {
            ...R,
            description: "Returns a specific accrual on a purchase",
            inputSchema: z.object({ purchaseId: z.number().int(), accrualId: z.number().int() }),
        },
        async ({ purchaseId, accrualId }) => {
            try {
                return ok(await get(cp(`/purchases/${purchaseId}/accruals/${accrualId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_purchase_accrual",
        {
            ...D,
            description: "Deletes an accrual on a purchase",
            inputSchema: z.object({ purchaseId: z.number().int(), accrualId: z.number().int() }),
        },
        async ({ purchaseId, accrualId }) => {
            try {
                return ok(
                    await mutate("DELETE", cp(`/purchases/${purchaseId}/accruals/${accrualId}`)),
                );
            } catch (e) {
                return err(e);
            }
        },
    );
}
