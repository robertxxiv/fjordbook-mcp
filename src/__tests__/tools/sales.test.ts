import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate } from "../../client.js";
import { register } from "../../tools/sales.js";
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

describe("fiken_list_sales", () => {
    it("calls GET /sales with filters", async () => {
        const data = [{ saleId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 25, settled: false, contactId: 42 };
        const result = await server.getHandler("fiken_list_sales")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/sales", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 401: Unauthorized"));
        const result = await server.getHandler("fiken_list_sales")({});
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockGetWithMeta.mockRejectedValue(42);
        const result = await server.getHandler("fiken_list_sales")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_sales")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_sale", () => {
    it("calls POST /sales with body", async () => {
        mockMutate.mockResolvedValue({ created: true, location: "/companies/test-slug/sales/1" });
        const body = {
            date: "2024-01-15",
            kind: "cash_sale",
            currency: "NOK",
            lines: [
                {
                    description: "Product",
                    netPrice: 100000,
                    vat: 25000,
                    vatType: "HIGH",
                    account: "3000",
                },
            ],
        };
        const result = await server.getHandler("fiken_create_sale")(body);
        expect(mockMutate).toHaveBeenCalledWith("POST", "/companies/test-slug/sales", body);
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler("fiken_create_sale")({
            date: "2024-01-01",
            kind: "cash_sale",
            currency: "NOK",
            lines: [],
        });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_get_sale", () => {
    it("calls GET /sales/{saleId}", async () => {
        const data = { saleId: 1 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale")({ saleId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale")({ saleId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_delete_sale", () => {
    it("calls PATCH /sales/{saleId}/delete with encoded description", async () => {
        mockMutate.mockResolvedValue({ success: true });
        const result = await server.getHandler("fiken_delete_sale")({
            saleId: 1,
            description: "Duplicate & wrong",
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "PATCH",
            "/companies/test-slug/sales/1/delete?description=Duplicate%20%26%20wrong",
        );
        expect(result.isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_sale")({
            saleId: 999,
            description: "x",
        });
        expect(result.isError).toBe(true);
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_delete_sale")({
            saleId: 1,
            description: "x",
        });
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_get_sale_attachments", () => {
    it("calls GET /sales/{saleId}/attachments", async () => {
        const data = [{ fileName: "receipt.pdf" }];
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_attachments")({ saleId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1/attachments");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_attachments")({ saleId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_list_sale_drafts", () => {
    it("calls GET /sales/drafts with params", async () => {
        const data = [{ draftId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10 };
        const result = await server.getHandler("fiken_list_sale_drafts")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/sales/drafts", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 401: Unauthorized"));
        const result = await server.getHandler("fiken_list_sale_drafts")({});
        expect(result.isError).toBe(true);
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_sale_drafts")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_sale_draft", () => {
    it("calls POST /sales/drafts with body", async () => {
        mockMutate.mockResolvedValue({
            created: true,
            location: "/companies/test-slug/sales/drafts/1",
        });
        const body = {
            invoiceIssueDate: "2024-01-15",
            contactId: 42,
            cash: false,
            paid: false,
            lines: [],
        };
        const result = await server.getHandler("fiken_create_sale_draft")(body);
        expect(mockMutate).toHaveBeenCalledWith("POST", "/companies/test-slug/sales/drafts", body);
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler("fiken_create_sale_draft")({});
        expect(result.isError).toBe(true);
    });
});

describe("fiken_get_sale_draft", () => {
    it("calls GET /sales/drafts/{draftId}", async () => {
        const data = { draftId: 1 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_draft")({ draftId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/drafts/1");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_draft")({ draftId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_update_sale_draft", () => {
    it("calls PUT /sales/drafts/{draftId} with body (draftId excluded)", async () => {
        mockMutate.mockResolvedValue({ success: true });
        const input = {
            draftId: 1,
            invoiceIssueDate: "2024-02-01",
            cash: true,
            paid: true,
            lines: [],
        };
        const result = await server.getHandler("fiken_update_sale_draft")(input);
        expect(mockMutate).toHaveBeenCalledWith("PUT", "/companies/test-slug/sales/drafts/1", {
            invoiceIssueDate: "2024-02-01",
            cash: true,
            paid: true,
            lines: [],
        });
        expect(result.isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_update_sale_draft")({ draftId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_delete_sale_draft", () => {
    it("calls DELETE /sales/drafts/{draftId}", async () => {
        mockMutate.mockResolvedValue({ success: true });
        const result = await server.getHandler("fiken_delete_sale_draft")({ draftId: 1 });
        expect(mockMutate).toHaveBeenCalledWith("DELETE", "/companies/test-slug/sales/drafts/1");
        expect(result.isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_sale_draft")({ draftId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_get_sale_draft_attachments", () => {
    it("calls GET /sales/drafts/{draftId}/attachments", async () => {
        const data = [{ fileName: "sale-draft.pdf" }];
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_draft_attachments")({ draftId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/drafts/1/attachments");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_draft_attachments")({
            draftId: 999,
        });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_create_sale_from_draft", () => {
    it("calls POST /sales/drafts/{draftId}/createSale", async () => {
        mockMutate.mockResolvedValue({ created: true, location: "/companies/test-slug/sales/3" });
        const result = await server.getHandler("fiken_create_sale_from_draft")({ draftId: 1 });
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/sales/drafts/1/createSale",
        );
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler("fiken_create_sale_from_draft")({ draftId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_settle_sale", () => {
    it("calls PATCH /sales/{saleId}/settled with settledDate", async () => {
        const data = { saleId: 1, settled: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_settle_sale")({
            saleId: 1,
            settledDate: "2024-05-01",
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "PATCH",
            "/companies/test-slug/sales/1/settled?settledDate=2024-05-01",
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_settle_sale")({
            saleId: 1,
            settledDate: "2024-05-01",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_settle_sale")({
            saleId: 1,
            settledDate: "2024-05-01",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_write_off_sale", () => {
    const body = { type: "COLLECTION_FAILED", date: "2024-06-01", comment: "No response" };

    it("calls PATCH /sales/{saleId}/writeOff with body (saleId excluded)", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_write_off_sale")({ saleId: 1, ...body });
        expect(mockMutate).toHaveBeenCalledWith(
            "PATCH",
            "/companies/test-slug/sales/1/writeOff",
            body,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_write_off_sale")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_write_off_sale")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_get_sale_payments", () => {
    it("calls GET /sales/{saleId}/payments", async () => {
        const data = [{ paymentId: 5 }];
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_payments")({ saleId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1/payments");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_payments")({ saleId: 1 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue(42);
        const result = await server.getHandler("fiken_get_sale_payments")({ saleId: 1 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_create_sale_payment", () => {
    const body = {
        date: "2024-03-01",
        account: "1920:10001",
        amount: 12500,
        currency: "EUR",
        amountInNok: 140000,
        fee: 500,
    };

    it("calls POST /sales/{saleId}/payments with body (saleId excluded)", async () => {
        const data = { created: true, location: "/x/5" };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_create_sale_payment")({ saleId: 1, ...body });
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/sales/1/payments",
            body,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_create_sale_payment")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_create_sale_payment")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_get_sale_payment", () => {
    it("calls GET /sales/{saleId}/payments/{paymentId}", async () => {
        const data = { paymentId: 5 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1/payments/5");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue(42);
        const result = await server.getHandler("fiken_get_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_delete_sale_payment", () => {
    it("calls DELETE /sales/{saleId}/payments/{paymentId}", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_delete_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "DELETE",
            "/companies/test-slug/sales/1/payments/5",
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_delete_sale_payment")({
            saleId: 1,
            paymentId: 5,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_delete_sale_payment (description)", () => {
    it("passes the encoded description as query param", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_delete_sale_payment")({
            saleId: 1,
            paymentId: 5,
            description: "wrong amount & date",
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "DELETE",
            "/companies/test-slug/sales/1/payments/5?description=wrong%20amount%20%26%20date",
        );
    });
});

describe("fiken_get_sale_accruals", () => {
    it("calls GET /sales/{saleId}/accruals", async () => {
        const data = [{ accrualId: 7 }];
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_accruals")({ saleId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1/accruals");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_accruals")({ saleId: 1 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue(42);
        const result = await server.getHandler("fiken_get_sale_accruals")({ saleId: 1 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_create_sale_accrual", () => {
    const body = { lineId: 99, startDate: "2024-04-01", periods: 12, account: "1749" };

    it("calls POST /sales/{saleId}/accruals with body (saleId excluded)", async () => {
        const data = { created: true, location: "/x/7" };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_create_sale_accrual")({ saleId: 1, ...body });
        expect(mockMutate).toHaveBeenCalledWith(
            "POST",
            "/companies/test-slug/sales/1/accruals",
            body,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_create_sale_accrual")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_create_sale_accrual")({ saleId: 1, ...body });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_get_sale_accrual", () => {
    it("calls GET /sales/{saleId}/accruals/{accrualId}", async () => {
        const data = { accrualId: 7 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/sales/1/accruals/7");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue(42);
        const result = await server.getHandler("fiken_get_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("fiken_delete_sale_accrual", () => {
    it("calls DELETE /sales/{saleId}/accruals/{accrualId}", async () => {
        const data = { success: true };
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler("fiken_delete_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(mockMutate).toHaveBeenCalledWith(
            "DELETE",
            "/companies/test-slug/sales/1/accruals/7",
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_delete_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });

    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue(42);
        const result = await server.getHandler("fiken_delete_sale_accrual")({
            saleId: 1,
            accrualId: 7,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: 42");
    });
});

describe("sale annotations and money fields", () => {
    type Cfg = { annotations?: { destructiveHint?: boolean } };
    const configs = new Map<string, Cfg>();
    beforeAll(() => {
        register({
            registerTool: (name: string, config: Cfg) => configs.set(name, config),
        } as never);
    });

    it.each(["fiken_settle_sale", "fiken_write_off_sale"])("%s is destructive", (name) => {
        expect(configs.get(name)!.annotations?.destructiveHint).toBe(true);
    });
});
