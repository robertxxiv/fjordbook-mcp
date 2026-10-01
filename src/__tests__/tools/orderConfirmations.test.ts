import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate } from "../../client.js";
import { register } from "../../tools/orderConfirmations.js";
import { createMockServer } from "../helpers.js";

const mockGet = vi.mocked(get);
const mockGetWithMeta = vi.mocked(getWithMeta);
const mockMutate = vi.mocked(mutate);
const server = createMockServer();

beforeAll(() => {
    register(server);
});
beforeEach(() => {
    vi.clearAllMocks();
});

describe("fiken_list_order_confirmations", () => {
    it("calls GET /orderConfirmations with params", async () => {
        const data = [{ confirmationId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10 };
        const result = await server.getHandler("fiken_list_order_confirmations")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith(
            "/companies/test-slug/orderConfirmations",
            params,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 401: Unauthorized"));
        const result = await server.getHandler("fiken_list_order_confirmations")({});
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockGetWithMeta.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_list_order_confirmations")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_order_confirmations")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_get_order_confirmation", () => {
    it("calls GET /orderConfirmations/{confirmationId}", async () => {
        const data = { confirmationId: 1, confirmationNumber: 1 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_order_confirmation")({
            confirmationId: "1",
        });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/orderConfirmations/1");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_order_confirmation")({
            confirmationId: "999",
        });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_get_order_confirmation_counter", () => {
    it("calls GET /orderConfirmations/counter", async () => {
        const data = { value: 5 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_order_confirmation_counter")({});
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/orderConfirmations/counter");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 500: Server Error"));
        const result = await server.getHandler("fiken_get_order_confirmation_counter")({});
        expect(result.isError).toBe(true);
    });
});

describe("fiken_create_order_confirmation_counter", () => {
    it("calls POST /orderConfirmations/counter with body", async () => {
        mockMutate.mockResolvedValue({
            created: true,
            location: "/companies/test-slug/orderConfirmations/counter",
        });
        const body = { value: 1 };
        const result = await server.getHandler("fiken_create_order_confirmation_counter")(body);
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/orderConfirmations/counter",
            body,
        );
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 409: Conflict"));
        const result = await server.getHandler("fiken_create_order_confirmation_counter")({});
        expect(result.isError).toBe(true);
    });
});

describe("fiken_create_invoice_draft_from_order_confirmation", () => {
    it("calls POST /orderConfirmations/{confirmationId}/createInvoiceDraft", async () => {
        mockMutate.mockResolvedValue({
            created: true,
            location: "/companies/test-slug/invoices/drafts/1",
        });
        const result = await server.getHandler(
            "fiken_create_invoice_draft_from_order_confirmation",
        )({
            confirmationId: "1",
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/orderConfirmations/1/createInvoiceDraft",
        );
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler(
            "fiken_create_invoice_draft_from_order_confirmation",
        )({
            confirmationId: "999",
        });
        expect(result.isError).toBe(true);
    });
});

const draftBody = {
    type: "order_confirmation" as const,
    daysUntilDueDate: 14,
    customerId: 5,
    issueDate: "2026-01-01",
    lines: [{ quantity: 2, unitPrice: 10000, vatType: "HIGH" }],
};

describe("fiken_list_order_confirmation_drafts", () => {
    it("calls GET /orderConfirmations/drafts with params", async () => {
        const data = [{ draftId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const result = await server.getHandler("fiken_list_order_confirmation_drafts")({
            page: 1,
            pageSize: 5,
        });
        expect(mockGetWithMeta).toHaveBeenCalledWith(
            "/companies/test-slug/orderConfirmations/drafts",
            {
                page: 1,
                pageSize: 5,
            },
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_list_order_confirmation_drafts")({
            page: 1,
            pageSize: 5,
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockGetWithMeta.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_list_order_confirmation_drafts")({
            page: 1,
            pageSize: 5,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_order_confirmation_drafts")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_order_confirmation_draft", () => {
    it("calls POST /orderConfirmations/drafts with body", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_create_order_confirmation_draft")(draftBody);
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/orderConfirmations/drafts",
            draftBody,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_create_order_confirmation_draft")(draftBody);
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_create_order_confirmation_draft")(draftBody);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
});

describe("fiken_get_order_confirmation_draft", () => {
    it("calls GET /orderConfirmations/drafts/{draftId}", async () => {
        const data = { draftId: 7 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_order_confirmation_draft")({
            draftId: 7,
        });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/orderConfirmations/drafts/7");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_order_confirmation_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_get_order_confirmation_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
});

describe("fiken_update_order_confirmation_draft", () => {
    it("calls PUT /orderConfirmations/drafts/{draftId} without draftId in body", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_update_order_confirmation_draft")({
            draftId: 7,
            ...draftBody,
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "PUT",
            "/companies/test-slug/orderConfirmations/drafts/7",
            draftBody,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_update_order_confirmation_draft")({
            draftId: 7,
            ...draftBody,
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_update_order_confirmation_draft")({
            draftId: 7,
            ...draftBody,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
});

describe("fiken_delete_order_confirmation_draft", () => {
    it("calls DELETE /orderConfirmations/drafts/{draftId}", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_delete_order_confirmation_draft")({
            draftId: 7,
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "DELETE",
            "/companies/test-slug/orderConfirmations/drafts/7",
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_order_confirmation_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_delete_order_confirmation_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
});

describe("fiken_create_order_confirmation_from_draft", () => {
    it("calls POST /orderConfirmations/drafts/{draftId}/createOrderConfirmation", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_create_order_confirmation_from_draft")({
            draftId: 7,
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/orderConfirmations/drafts/7/createOrderConfirmation",
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_create_order_confirmation_from_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("connection refused");
        const result = await server.getHandler("fiken_create_order_confirmation_from_draft")({
            draftId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: connection refused");
    });
});
