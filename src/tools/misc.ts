import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, mutate, cp, uploadMultipart } from "../client.js";
import { R, W, D, ok, err } from "./shared.js";

const paging = z.object({
    page: z.number().int().optional().describe("Page number, 0-indexed"),
    pageSize: z.number().int().optional().describe("Results per page, max 100"),
});

const dateFilter = (what: string) => z.string().optional().describe(`${what}, format YYYY-MM-DD`);

const inboxDocumentSchema = z.object({
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
});

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
            description: "Returns incoming documents in the company inbox",
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
                return ok(await get(cp("/inbox"), p));
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
                "Uploads a document to the company inbox (multipart). Provide exactly one of filePath or fileBase64.",
            inputSchema: inboxDocumentSchema,
        },
        async ({ name, filename, description, filePath, fileBase64 }) => {
            try {
                if (!filePath && !fileBase64) {
                    throw new Error("Either filePath or fileBase64 is required");
                }
                if (filePath && fileBase64) {
                    throw new Error("Provide only one of filePath or fileBase64");
                }
                if (fileBase64 && !filename) {
                    throw new Error("filename is required when using fileBase64");
                }
                const resolvedFilename = filename ?? basename(filePath!);
                const bytes =
                    fileBase64 !== undefined
                        ? Buffer.from(fileBase64, "base64")
                        : await readFile(filePath!);
                const form = new FormData();
                form.append("filename", resolvedFilename);
                form.append("name", name ?? resolvedFilename);
                if (description !== undefined) form.append("description", description);
                form.append("file", new Blob([bytes]), resolvedFilename);
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
            description: "Returns received EHF (electronic invoice) documents",
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
                return ok(await get(cp("/ehf"), p));
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
