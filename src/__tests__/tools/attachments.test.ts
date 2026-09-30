import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    mutate: vi.fn(),
    uploadMultipart: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, mutate, uploadMultipart } from "../../client.js";
import { register } from "../../tools/attachments.js";
import { createMockServer } from "../helpers.js";

const mockGet = vi.mocked(get);
const mockMutate = vi.mocked(mutate);
const mockUpload = vi.mocked(uploadMultipart);
const server = createMockServer();

let dir: string;
let pdfPath: string;

beforeAll(async () => {
    register(server);
    dir = await mkdtemp(join(tmpdir(), "fiken-att-"));
    pdfPath = join(dir, "receipt.pdf");
    await writeFile(pdfPath, "pdf-bytes");
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
    vi.clearAllMocks();
});

// [tool suffix, id param, path base, has document ids]
const uploads: Array<[string, string, string, boolean]> = [
    ["contact", "contactId", "/contacts", false],
    ["invoice", "invoiceId", "/invoices", false],
    ["invoice_draft", "draftId", "/invoices/drafts", false],
    ["credit_note_draft", "draftId", "/creditNotes/drafts", false],
    ["journal_entry", "journalEntryId", "/journalEntries", true],
    ["offer_draft", "draftId", "/offers/drafts", false],
    ["order_confirmation_draft", "draftId", "/orderConfirmations/drafts", false],
    ["purchase_draft", "draftId", "/purchases/drafts", true],
    ["sale_draft", "draftId", "/sales/drafts", true],
    ["sale", "saleId", "/sales", true],
];

describe.each(uploads)("fiken_add_%s_attachment", (name, idParam, base, hasDocs) => {
    const tool = `fiken_add_${name}_attachment`;
    const path = `/companies/test-slug${base}/7/attachments`;

    it("uploads a file from filePath with derived filename", async () => {
        mockUpload.mockResolvedValue({ created: true, location: "loc" });
        const result = await server.getHandler(tool)({ [idParam]: 7, filePath: pdfPath });
        expect(mockUpload).toHaveBeenCalledOnce();
        const [p, params, form] = mockUpload.mock.calls[0];
        expect(p).toBe(path);
        expect(params === undefined || Object.keys(params).length === 0).toBe(true);
        expect(form.get("filename")).toBe("receipt.pdf");
        expect((form.get("file") as File).name).toBe("receipt.pdf");
        expect(result.content[0].text).toBe(
            JSON.stringify({ created: true, location: "loc" }, null, 2),
        );
    });

    it("uploads base64 content with explicit filename", async () => {
        mockUpload.mockResolvedValue({ created: true });
        await server.getHandler(tool)({
            [idParam]: 7,
            fileBase64: Buffer.from("hello").toString("base64"),
            filename: "a.PNG",
        });
        const form = mockUpload.mock.calls[0][2];
        expect(form.get("filename")).toBe("a.PNG");
        expect(await (form.get("file") as File).text()).toBe("hello");
    });

    it("rejects missing file source", async () => {
        const result = await server.getHandler(tool)({ [idParam]: 7 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("is required");
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it("rejects both filePath and fileBase64", async () => {
        const result = await server.getHandler(tool)({
            [idParam]: 7,
            filePath: pdfPath,
            fileBase64: "aGk=",
        });
        expect(result.content[0].text).toContain("only one of filePath or fileBase64");
    });

    it("requires filename with base64", async () => {
        const result = await server.getHandler(tool)({ [idParam]: 7, fileBase64: "aGk=" });
        expect(result.content[0].text).toContain("filename is required");
    });

    it("rejects unsupported extensions", async () => {
        const result = await server.getHandler(tool)({
            [idParam]: 7,
            fileBase64: "aGk=",
            filename: "a.txt",
        });
        expect(result.content[0].text).toContain("filename must end with");
    });

    it("returns error when the upload fails", async () => {
        mockUpload.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler(tool)({ [idParam]: 7, filePath: pdfPath });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 400: Bad Request");
    });

    it("handles non-Error throws", async () => {
        mockUpload.mockRejectedValue("boom");
        const result = await server.getHandler(tool)({ [idParam]: 7, filePath: pdfPath });
        expect(result.content[0].text).toBe("Error: boom");
    });

    if (hasDocs) {
        it("attaches an existing document without uploading a file", async () => {
            mockUpload.mockResolvedValue({ created: true });
            await server.getHandler(tool)({ [idParam]: 7, inboxDocumentId: 55 });
            const [p, params, form] = mockUpload.mock.calls[0];
            expect(p).toBe(path);
            expect(params).toEqual({ inboxDocumentId: 55 });
            expect(form.has("file")).toBe(false);
            await server.getHandler(tool)({ [idParam]: 7, ehfDocumentId: 9 });
            expect(mockUpload.mock.calls[1][1]).toEqual({ ehfDocumentId: 9 });
        });
    } else {
        it("does not send query params", async () => {
            mockUpload.mockResolvedValue({ created: true });
            await server.getHandler(tool)({ [idParam]: 7, filePath: pdfPath });
            expect(mockUpload.mock.calls[0][1]).toBeUndefined();
        });
    }
});

describe("fiken_add_contact_attachment", () => {
    it("sends the optional comment as a form field", async () => {
        mockUpload.mockResolvedValue({ created: true });
        await server.getHandler("fiken_add_contact_attachment")({
            contactId: 7,
            filePath: pdfPath,
            comment: "signed",
        });
        expect(mockUpload.mock.calls[0][2].get("comment")).toBe("signed");
    });
});

describe("fiken_add_sale_attachment", () => {
    it("passes attachToPayment/attachToSale as query params", async () => {
        mockUpload.mockResolvedValue({ created: true });
        await server.getHandler("fiken_add_sale_attachment")({
            saleId: 7,
            filePath: pdfPath,
            attachToPayment: true,
            attachToSale: false,
        });
        expect(mockUpload.mock.calls[0][1]).toEqual({ attachToPayment: true, attachToSale: false });
    });
});

const deletes: Array<[string, string, string]> = [
    ...uploads.map(([n, i, b]) => [n, i, b] as [string, string, string]),
    ["purchase", "purchaseId", "/purchases"],
];

describe.each(deletes)("fiken_delete_%s_attachment", (name, idParam, base) => {
    const tool = `fiken_delete_${name}_attachment`;
    const uuid = "745b2f15-0000-4408-b000-b1d2d0610cb2";

    it("calls DELETE on the attachment", async () => {
        mockMutate.mockResolvedValue({ success: true });
        const result = await server.getHandler(tool)({ [idParam]: 7, attachmentUuid: uuid });
        expect(mockMutate).toHaveBeenCalledWith(
            "DELETE",
            `/companies/test-slug${base}/7/attachments/${uuid}`,
        );
        expect(result.content[0].text).toBe(JSON.stringify({ success: true }, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler(tool)({ [idParam]: 7, attachmentUuid: uuid });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error throws", async () => {
        mockMutate.mockRejectedValue("boom");
        const result = await server.getHandler(tool)({ [idParam]: 7, attachmentUuid: uuid });
        expect(result.content[0].text).toBe("Error: boom");
    });
});

const lists: Array<[string, string, string]> = [
    ["contact", "contactId", "/contacts"],
    ["order_confirmation_draft", "draftId", "/orderConfirmations/drafts"],
];

describe.each(lists)("fiken_get_%s_attachments", (name, idParam, base) => {
    const tool = `fiken_get_${name}_attachments`;

    it("calls GET on the attachments collection", async () => {
        const data = [{ uuid: "x" }];
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler(tool)({ [idParam]: 7 });
        expect(mockGet).toHaveBeenCalledWith(`/companies/test-slug${base}/7/attachments`);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 500: err"));
        const result = await server.getHandler(tool)({ [idParam]: 7 });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error throws", async () => {
        mockGet.mockRejectedValue("boom");
        const result = await server.getHandler(tool)({ [idParam]: 7 });
        expect(result.content[0].text).toBe("Error: boom");
    });
});
