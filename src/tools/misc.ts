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

const paging = z.object({ page: pageField, pageSize: pageSizeField });

const dateFilter = (what: string) => z.string().optional().describe(`${what}, format YYYY-MM-DD`);

const { input: inboxDocumentSchema, validated: validatedInboxDocument } = refinedInput(
    z.object({
        name: z.string().optional().describe("Name of the inbox document, usually the filename"),
        filename: z
            .string()
            .optional()
            .describe(
                "Filename of the uploaded file. Required with fileBase64; defaults to the basename of filePath",
            ),
        description: z.string().optional().describe("Additional description of the inbox document"),
        filePath: z.string().optional().describe("Local path to the file to upload"),
        fileBase64: z.string().optional().describe("Base64-encoded file contents"),
    }),
    exactlyOneSource(false),
);

export function register(server: McpServer) {
    // Products / reports
    server.registerTool(
        "fiken_create_product_sales_report",
        {
            ...W,
            description: "Creates a product sales report for a date range",
            inputSchema: z.object({
                from: z.string().describe("Start date of the range, inclusive, format YYYY-MM-DD"),
                to: z.string().describe("End date of the range, inclusive, format YYYY-MM-DD"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/products/salesReport"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    // Inbox
    server.registerTool(
        "fiken_list_inbox",
        {
            ...R,
            description: "Returns incoming documents in the company inbox" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                sortBy: z
                    .enum(["createdDate asc", "createdDate desc", "name asc", "name desc"])
                    .optional(),
                status: z
                    .enum(["all", "unused", "used"])
                    .optional()
                    .describe("Filter on whether the document has been used"),
                name: z
                    .string()
                    .optional()
                    .describe("Case-insensitive substring match on document name"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/inbox"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_inbox_document",
        {
            ...W,
            description:
                "Uploads a document (.png, .jpeg, .jpg, .gif or .pdf) to the company inbox (multipart). Provide exactly one of filePath or fileBase64. " +
                UPLOAD_ENV_NOTE,
            inputSchema: inboxDocumentSchema,
        },
        async (raw) => {
            try {
                const { name, filename, description, filePath, fileBase64 } = parseInput(
                    validatedInboxDocument,
                    raw,
                );
                const upload = await loadUpload({ filename, filePath, fileBase64 });
                const form = new FormData();
                form.append("filename", upload.filename);
                form.append("name", name ?? upload.filename);
                if (description !== undefined) form.append("description", description);
                form.append("file", upload.blob, upload.filename);
                return ok(await uploadMultipart(cp("/inbox"), undefined, form));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_inbox_document",
        {
            ...R,
            description: "Returns a specific inbox document by ID",
            inputSchema: z.object({ inboxDocumentId: z.number().int() }),
        },
        async ({ inboxDocumentId }) => {
            try {
                return ok(await get(cp(`/inbox/${inboxDocumentId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_inbox_document",
        {
            ...D,
            description: "Deletes an inbox document",
            inputSchema: z.object({ inboxDocumentId: z.number().int() }),
        },
        async ({ inboxDocumentId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/inbox/${inboxDocumentId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    // EHF
    server.registerTool(
        "fiken_list_ehf_documents",
        {
            ...R,
            description: "Returns received EHF (electronic invoice) documents" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                sortBy: z
                    .enum([
                        "createdDate asc",
                        "createdDate desc",
                        "issueDate asc",
                        "issueDate desc",
                    ])
                    .optional(),
                status: z
                    .enum(["unprocessed", "used", "processed", "deleted"])
                    .optional()
                    .describe("Processing state; unprocessed = still in the inbox"),
                issueDate: dateFilter("Issue date equal to"),
                issueDateLe: dateFilter("Issue date less than or equal to"),
                issueDateLt: dateFilter("Issue date strictly less than"),
                issueDateGe: dateFilter("Issue date greater than or equal to"),
                issueDateGt: dateFilter("Issue date strictly greater than"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/ehf"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_ehf_document",
        {
            ...R,
            description: "Returns a specific received EHF document by ID",
            inputSchema: z.object({ ehfDocumentId: z.number().int() }),
        },
        async ({ ehfDocumentId }) => {
            try {
                return ok(await get(cp(`/ehf/${ehfDocumentId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}
