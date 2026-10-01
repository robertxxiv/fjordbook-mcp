import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { get, mutate, cp, uploadMultipart } from "../client.js";
import { R, W, D, ok, err } from "./shared.js";
import {
    UPLOAD_ENV_NOTE,
    SUPPORTED_EXTENSIONS_TEXT,
    exactlyOneSource,
    refinedInput,
    loadUpload,
    parseInput,
    type UploadSource,
} from "./upload.js";

type Resource = {
    /** Tool name suffix, e.g. "invoice_draft" gives fiken_add_invoice_draft_attachment */
    name: string;
    /** Human readable name used in descriptions */
    label: string;
    /** Path prefix under the company, e.g. "/invoices/drafts" */
    base: string;
    /** Name of the id path parameter */
    idParam: string;
    /** Extra query parameters accepted by the POST operation */
    query?: ZodRawShape;
    /** Extra multipart form fields accepted by the POST operation */
    form?: ZodRawShape;
    /** Whether the POST may reference an EHF/inbox document instead of a file */
    documentIds?: boolean;
};

const documentIdQuery = {
    ehfDocumentId: z
        .number()
        .int()
        .optional()
        .describe(
            "Attach an existing received EHF document instead of uploading a file. Provide exactly one of filePath/fileBase64, ehfDocumentId or inboxDocumentId",
        ),
    inboxDocumentId: z
        .number()
        .int()
        .optional()
        .describe(
            "Attach an existing inbox document instead of uploading a file. Provide exactly one of filePath/fileBase64, ehfDocumentId or inboxDocumentId",
        ),
};

const paymentFlags = {
    attachToPayment: z.boolean().optional().describe("Attach the file to the payment of the sale"),
    attachToSale: z.boolean().optional().describe("Attach the file to the sale itself"),
};

const resources: Resource[] = [
    {
        name: "contact",
        label: "contact",
        base: "/contacts",
        idParam: "contactId",
        form: { comment: z.string().optional().describe("Optional comment for the attachment") },
    },
    { name: "invoice", label: "invoice", base: "/invoices", idParam: "invoiceId" },
    {
        name: "invoice_draft",
        label: "invoice draft",
        base: "/invoices/drafts",
        idParam: "draftId",
    },
    {
        name: "credit_note_draft",
        label: "credit note draft",
        base: "/creditNotes/drafts",
        idParam: "draftId",
    },
    {
        name: "journal_entry",
        label: "journal entry",
        base: "/journalEntries",
        idParam: "journalEntryId",
        query: documentIdQuery,
        documentIds: true,
    },
    { name: "offer_draft", label: "offer draft", base: "/offers/drafts", idParam: "draftId" },
    {
        name: "order_confirmation_draft",
        label: "order confirmation draft",
        base: "/orderConfirmations/drafts",
        idParam: "draftId",
    },
    {
        name: "purchase_draft",
        label: "purchase draft",
        base: "/purchases/drafts",
        idParam: "draftId",
        query: documentIdQuery,
        documentIds: true,
    },
    {
        name: "sale_draft",
        label: "sale draft",
        base: "/sales/drafts",
        idParam: "draftId",
        query: documentIdQuery,
        documentIds: true,
    },
    {
        name: "sale",
        label: "sale",
        base: "/sales",
        idParam: "saleId",
        query: { ...paymentFlags, ...documentIdQuery },
        documentIds: true,
    },
];

// Purchase attachments (add/list) live in purchases.ts; only delete is added here.
const deleteOnly: Resource = {
    name: "purchase",
    label: "purchase",
    base: "/purchases",
    idParam: "purchaseId",
};

function registerUpload(server: McpServer, r: Resource) {
    const shape: ZodRawShape = {
        [r.idParam]: z.number().int().describe(`ID of the ${r.label}`),
        filePath: z.string().optional().describe("Local path to the file to upload"),
        fileBase64: z
            .string()
            .optional()
            .describe("Base64-encoded file contents (alternative to filePath)"),
        filename: z
            .string()
            .optional()
            .describe(
                `Filename; must end with ${SUPPORTED_EXTENSIONS_TEXT}. Defaults to the basename of filePath; required with fileBase64`,
            ),
        ...r.form,
        ...r.query,
    };
    const { input: inputSchema, validated } = refinedInput(
        z.object(shape),
        exactlyOneSource(!!r.documentIds),
    );
    const idKey = r.idParam;
    const formKeys = Object.keys(r.form ?? {});
    const queryKeys = Object.keys(r.query ?? {});
    server.registerTool(
        `fiken_add_${r.name}_attachment`,
        {
            ...W,
            description: `Creates and adds a new attachment (${SUPPORTED_EXTENSIONS_TEXT}) to a ${r.label}${
                r.documentIds
                    ? ", or attaches an existing EHF/inbox document via ehfDocumentId or inboxDocumentId"
                    : ""
            }. Provide exactly one source: ${
                r.documentIds
                    ? "filePath, fileBase64, ehfDocumentId or inboxDocumentId"
                    : "filePath or fileBase64"
            }. ${UPLOAD_ENV_NOTE}`,
            inputSchema,
        },
        async (raw) => {
            try {
                const p = parseInput(validated, raw) as Record<string, unknown>;
                const form = new FormData();
                if (p.filePath || p.fileBase64) {
                    const { filename, blob } = await loadUpload(p as UploadSource);
                    form.append("filename", filename);
                    form.append("file", blob, filename);
                }
                for (const k of formKeys) {
                    if (p[k] !== undefined) form.append(k, String(p[k]));
                }
                const params: Record<string, string | number | boolean> = {};
                for (const k of queryKeys) {
                    if (p[k] !== undefined) params[k] = p[k] as string | number | boolean;
                }
                return ok(
                    await uploadMultipart(
                        cp(`${r.base}/${p[idKey]}/attachments`),
                        queryKeys.length ? params : undefined,
                        form,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );
}

function registerDelete(server: McpServer, r: Resource) {
    server.registerTool(
        `fiken_delete_${r.name}_attachment`,
        {
            ...D,
            description: `Deletes an attachment from a ${r.label}`,
            inputSchema: z.object({
                [r.idParam]: z.number().int().describe(`ID of the ${r.label}`),
                attachmentUuid: z
                    .string()
                    .uuid()
                    .describe(
                        "UUID of the attachment, returned as `uuid` by the GET attachments call",
                    ),
            }),
        },
        async (raw) => {
            try {
                const p = raw as Record<string, unknown>;
                return ok(
                    await mutate(
                        "DELETE",
                        cp(`${r.base}/${p[r.idParam]}/attachments/${p.attachmentUuid}`),
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );
}

function registerList(server: McpServer, r: Resource) {
    server.registerTool(
        `fiken_get_${r.name}_attachments`,
        {
            ...R,
            description: `Returns all attachments on a ${r.label}`,
            inputSchema: z.object({
                [r.idParam]: z.number().int().describe(`ID of the ${r.label}`),
            }),
        },
        async (raw) => {
            try {
                const p = raw as Record<string, unknown>;
                return ok(await get(cp(`${r.base}/${p[r.idParam]}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}

export function register(server: McpServer) {
    for (const r of resources) {
        registerUpload(server, r);
        registerDelete(server, r);
    }
    registerDelete(server, deleteOnly);
    // Listing operations not covered by the other modules
    registerList(server, resources[0]);
    registerList(server, resources[6]);
}
