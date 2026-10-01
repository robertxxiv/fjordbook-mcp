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
import { draftSchema, sendSchema } from "./orderConfirmations.js";

const creditNoteLine = z.object({
    incomeAccount: z
        .string()
        .optional()
        .describe("Income account, e.g. 3000. Defaults to the product's income account"),
    vatType: z
        .string()
        .optional()
        .describe(
            "VAT type for sales, e.g. NONE, HIGH, MEDIUM, RAW_FISH, LOW, EXEMPT, EXEMPT_IMPORT_EXPORT, EXEMPT_REVERSE",
        ),
    unitPrice: z.number().int().describe("Net price per unit in document currency, in cents (øre)"),
    quantity: z.number().describe("Number of units"),
    discount: z.number().optional().describe("Percentage discount on the line"),
    productId: z.number().int().optional().describe("ID of the product on this line"),
    description: z.string().optional().describe("Description of the product or service"),
    comment: z.string().optional().describe("Additional information printed on the document"),
});

const roundingType = z
    .enum(["none", "round_half", "round_whole", "round_down_half", "round_down_whole"])
    .optional()
    .describe(
        "Øre rounding applied to the total. Allowed values: none, round_half, round_whole, round_down_half, round_down_whole",
    );

const pagination = {
    page: pageField,
    pageSize: pageSizeField,
};

const draftId = z.number().int().describe("Draft ID");

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_credit_notes",
        {
            ...R,
            description: "Returns all credit notes for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...pagination,
                issueDate: dateField().optional().describe("Exact issue date, format yyyy-mm-dd"),
                issueDateLe: dateField().optional().describe("Issue date <=, format yyyy-mm-dd"),
                issueDateLt: dateField().optional().describe("Issue date <, format yyyy-mm-dd"),
                issueDateGe: dateField().optional().describe("Issue date >=, format yyyy-mm-dd"),
                issueDateGt: dateField().optional().describe("Issue date >, format yyyy-mm-dd"),
                lastModified: dateField()
                    .optional()
                    .describe("Exact last-modified date, format yyyy-mm-dd"),
                lastModifiedLe: dateField()
                    .optional()
                    .describe("Last modified <=, format yyyy-mm-dd"),
                lastModifiedLt: dateField()
                    .optional()
                    .describe("Last modified <, format yyyy-mm-dd"),
                lastModifiedGe: dateField()
                    .optional()
                    .describe("Last modified >=, format yyyy-mm-dd"),
                lastModifiedGt: dateField()
                    .optional()
                    .describe("Last modified >, format yyyy-mm-dd"),
                customerId: z.number().int().optional().describe("Filter by customer ID"),
                settled: z.boolean().optional().describe("Filter by settled status"),
                creditNoteDraftUuid: z
                    .string()
                    .optional()
                    .describe("UUID of the draft the credit note was created from"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/creditNotes"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_credit_note",
        {
            ...R,
            description: "Returns a specific credit note by ID",
            inputSchema: z.object({ creditNoteId: z.number().int().describe("Credit note ID") }),
        },
        async ({ creditNoteId }) => {
            try {
                return ok(await get(cp(`/creditNotes/${creditNoteId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_full_credit_note",
        {
            ...W,
            description: "Creates a credit note covering the full amount of an invoice",
            inputSchema: z.object({
                issueDate: dateField().describe("Issue date YYYY-MM-DD"),
                invoiceId: z.number().int().describe("ID of the invoice to credit"),
                creditNoteText: z.string().optional(),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/creditNotes/full"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_partial_credit_note",
        {
            ...W,
            description:
                "Creates a credit note for a partial amount of an invoice. Lines must total less than the original invoice.",
            inputSchema: z.object({
                ourReference: z.string().optional(),
                yourReference: z.string().optional(),
                orderReference: z.string().optional(),
                project: z.number().int().optional(),
                currency: z.string().optional().describe('ISO 4217, e.g. "NOK"'),
                issueDate: dateField().describe("Issue date YYYY-MM-DD"),
                invoiceId: z.number().int().optional().describe("ID of the invoice to credit"),
                contactId: z.number().int().optional(),
                contactPersonId: z.number().int().optional(),
                creditNoteText: z.string().optional(),
                lines: z.array(creditNoteLine),
                roundingType,
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/creditNotes/partial"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_send_credit_note",
        {
            ...W,
            description: "Sends a credit note via email and/or EHF",
            inputSchema: z.object({
                creditNoteId: z.number().int().describe("ID of the credit note to send"),
                ...sendSchema.shape,
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/creditNotes/send"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_credit_note_counter",
        {
            ...R,
            description: "Retrieves the current credit note number counter",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get(cp("/creditNotes/counter")));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_credit_note_counter",
        {
            ...W,
            description: "Creates the first credit note number counter",
            inputSchema: z.object({
                value: z.number().int().optional().describe("Current value of the counter"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/creditNotes/counter"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_credit_note_drafts",
        {
            ...R,
            description: "Returns all credit note drafts for the company" + PAGINATION_NOTE,
            inputSchema: z.object(pagination),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/creditNotes/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_credit_note_draft",
        {
            ...W,
            description: "Creates a new credit note draft",
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/creditNotes/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_credit_note_draft",
        {
            ...R,
            description: "Returns a specific credit note draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/creditNotes/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_credit_note_draft",
        {
            ...W,
            description: "Updates a credit note draft",
            inputSchema: z.object({ draftId, ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/creditNotes/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_credit_note_draft",
        {
            ...D,
            description: "Deletes a credit note draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/creditNotes/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_credit_note_draft_attachments",
        {
            ...R,
            description: "Returns all attachments for a credit note draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/creditNotes/drafts/${draftId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_credit_note_from_draft",
        {
            ...W,
            description: "Creates a finalized credit note from a draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(
                    await mutate("POST", cp(`/creditNotes/drafts/${draftId}/createCreditNote`)),
                );
            } catch (e) {
                return err(e);
            }
        },
    );
}
