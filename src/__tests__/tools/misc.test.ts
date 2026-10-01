import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    uploadMultipart: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate, uploadMultipart } from "../../client.js";
import { register } from "../../tools/misc.js";
import { createMockServer } from "../helpers.js";

const mockGet = vi.mocked(get);
const mockGetWithMeta = vi.mocked(getWithMeta);
const mockMutate = vi.mocked(mutate);
const mockUpload = vi.mocked(uploadMultipart);
const server = createMockServer();

beforeAll(() => {
    register(server);
});
beforeEach(() => {
    vi.clearAllMocks();
});

describe("fiken_create_product_sales_report", () => {
    it("calls POST /products/salesReport with body", async () => {
        const data = [{ productId: 1, totalSold: 5 }];
        mockMutate.mockResolvedValue(data);
        const body = { from: "2024-01-01", to: "2024-12-31" };
        const result = await server.getHandler("fiken_create_product_sales_report")(body);
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/products/salesReport",
            body,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler("fiken_create_product_sales_report")({
            from: "2024-01-01",
            to: "2024-12-31",
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("quota exceeded");
        const result = await server.getHandler("fiken_create_product_sales_report")({
            from: "2024-01-01",
            to: "2024-12-31",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: quota exceeded");
    });
});

function simpleGet(tool: string, args: Record<string, unknown>, path: string, params?: unknown) {
    const paged = params !== undefined;
    const mock = paged ? mockGetWithMeta : mockGet;
    describe(tool, () => {
        it(`calls GET ${path}`, async () => {
            const data = { ok: 1 };
            mock.mockResolvedValue((paged ? { data, pagination: undefined } : data) as never);
            const result = await server.getHandler(tool)(args);
            if (!paged) expect(mock).toHaveBeenCalledWith(path);
            else expect(mock).toHaveBeenCalledWith(path, params);
            expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
        });
        if (paged) {
            it("wraps items with pagination when present", async () => {
                const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
                mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
                const result = await server.getHandler(tool)(args);
                expect(result.content[0].text).toBe(
                    JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
                );
            });
        }
        it("returns error on failure", async () => {
            mock.mockRejectedValue(new Error("Fiken 404: Not Found"));
            const result = await server.getHandler(tool)(args);
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
        });
        it("handles non-Error thrown values", async () => {
            mock.mockRejectedValue("boom");
            const result = await server.getHandler(tool)(args);
            expect(result.content[0].text).toBe("Error: boom");
        });
    });
}

simpleGet(
    "fiken_list_inbox",
    { page: 0, pageSize: 25, sortBy: "name asc", status: "unused", name: "inv" },
    "/companies/test-slug/inbox",
    { page: 0, pageSize: 25, sortBy: "name asc", status: "unused", name: "inv" },
);
simpleGet("fiken_get_inbox_document", { inboxDocumentId: 7 }, "/companies/test-slug/inbox/7");
simpleGet(
    "fiken_list_ehf_documents",
    {
        page: 1,
        sortBy: "issueDate desc",
        status: "unprocessed",
        issueDate: "2024-01-01",
        issueDateLe: "2024-02-01",
        issueDateLt: "2024-02-02",
        issueDateGe: "2023-01-01",
        issueDateGt: "2023-01-02",
    },
    "/companies/test-slug/ehf",
    {
        page: 1,
        sortBy: "issueDate desc",
        status: "unprocessed",
        issueDate: "2024-01-01",
        issueDateLe: "2024-02-01",
        issueDateLt: "2024-02-02",
        issueDateGe: "2023-01-01",
        issueDateGt: "2023-01-02",
    },
);
simpleGet("fiken_get_ehf_document", { ehfDocumentId: 9 }, "/companies/test-slug/ehf/9");

describe("fiken_delete_inbox_document", () => {
    it("calls DELETE /inbox/{id}", async () => {
        mockMutate.mockResolvedValue({ success: true });
        const result = await server.getHandler("fiken_delete_inbox_document")({
            inboxDocumentId: 7,
        });
        expect(mockMutate).toHaveBeenCalledWith("DELETE", "/companies/test-slug/inbox/7");
        expect(result.content[0].text).toBe(JSON.stringify({ success: true }, null, 2));
    });
    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_inbox_document")({
            inboxDocumentId: 7,
        });
        expect(result.isError).toBe(true);
    });
    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("boom");
        const result = await server.getHandler("fiken_delete_inbox_document")({
            inboxDocumentId: 7,
        });
        expect(result.content[0].text).toBe("Error: boom");
    });
});

describe("fiken_create_inbox_document", () => {
    const tool = "fiken_create_inbox_document";

    it("uploads base64 content as multipart", async () => {
        mockUpload.mockResolvedValue({ created: true, location: "x" });
        const result = await server.getHandler(tool)({
            fileBase64: Buffer.from("hello").toString("base64"),
            filename: "a.pdf",
            name: "Receipt",
            description: "Lunch",
        });
        expect(result.isError).toBeUndefined();
        const [path, params, form] = mockUpload.mock.calls[0];
        expect(path).toBe("/companies/test-slug/inbox");
        expect(params).toBeUndefined();
        const fd = form as FormData;
        expect(fd.get("filename")).toBe("a.pdf");
        expect(fd.get("name")).toBe("Receipt");
        expect(fd.get("description")).toBe("Lunch");
        const file = fd.get("file") as File;
        expect(file.name).toBe("a.pdf");
        expect(await file.text()).toBe("hello");
    });

    it("reads filePath, defaulting filename and name to its basename", async () => {
        const dir = mkdtempSync(join(tmpdir(), "fiken-inbox-"));
        const p = join(dir, "scan.png");
        writeFileSync(p, "png-bytes");
        mockUpload.mockResolvedValue({ created: true });
        await server.getHandler(tool)({ filePath: p });
        const fd = mockUpload.mock.calls[0][2] as FormData;
        expect(fd.get("filename")).toBe("scan.png");
        expect(fd.get("name")).toBe("scan.png");
        expect(fd.has("description")).toBe(false);
        expect(await (fd.get("file") as File).text()).toBe("png-bytes");
    });

    it("rejects missing file source", async () => {
        const result = await server.getHandler(tool)({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Either filePath or fileBase64 is required");
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it("rejects both file sources", async () => {
        const result = await server.getHandler(tool)({ filePath: "/x", fileBase64: "eA==" });
        expect(result.content[0].text).toBe("Error: Provide only one of filePath or fileBase64");
    });

    it("requires filename with base64", async () => {
        const result = await server.getHandler(tool)({ fileBase64: "eA==" });
        expect(result.content[0].text).toBe("Error: filename is required when using fileBase64");
    });

    it("returns error on upload failure", async () => {
        mockUpload.mockRejectedValue(new Error("Fiken 400: Bad"));
        const result = await server.getHandler(tool)({ fileBase64: "eA==", filename: "a.pdf" });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockUpload.mockRejectedValue("boom");
        const result = await server.getHandler(tool)({ fileBase64: "eA==", filename: "a.pdf" });
        expect(result.content[0].text).toBe("Error: boom");
    });
});
