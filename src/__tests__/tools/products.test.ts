import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate } from "../../client.js";
import { register } from "../../tools/products.js";
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

const product = {
    name: "Spade",
    unitPrice: 300000,
    incomeAccount: "3000",
    vatType: "HIGH",
    active: true,
    productNumber: "125-1",
    stock: 5.5,
    note: "n",
};

function errorTests(
    tool: string,
    mock: typeof mockGetWithMeta | typeof mockMutate,
    params: unknown,
) {
    it("returns error on failure", async () => {
        mock.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler(tool)(params);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 400: Bad Request");
    });

    it("handles non-Error thrown values", async () => {
        mock.mockRejectedValue("service unavailable");
        const result = await server.getHandler(tool)(params);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: service unavailable");
    });
}

describe("fiken_list_products", () => {
    it("calls GET /products with filters", async () => {
        const data = [{ productId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10, name: "Spade", productNumber: "1", active: true };
        const result = await server.getHandler("fiken_list_products")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/products", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });
    errorTests("fiken_list_products", mockGetWithMeta, {});

    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_products")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_product", () => {
    it("calls POST /products with body", async () => {
        mockMutate.mockResolvedValue({ created: true });
        const result = await server.getHandler("fiken_create_product")(product);
        expect(mockMutate).toHaveBeenCalledWith("POST", "/companies/test-slug/products", product);
        expect(result.content[0].text).toContain("created");
    });
    errorTests("fiken_create_product", mockMutate, product);
});

describe("fiken_get_product", () => {
    it("calls GET /products/{productId}", async () => {
        mockGet.mockResolvedValue({ productId: 7 });
        const result = await server.getHandler("fiken_get_product")({ productId: 7 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/products/7");
        expect(result.content[0].text).toContain("7");
    });
    errorTests("fiken_get_product", mockGet, { productId: 7 });
});

describe("fiken_update_product", () => {
    it("calls PUT /products/{productId} with body (productId excluded)", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_update_product")({ productId: 7, ...product });
        expect(mockMutate).toHaveBeenCalledWith("PUT", "/companies/test-slug/products/7", product);
    });
    errorTests("fiken_update_product", mockMutate, { productId: 7, ...product });
});

describe("fiken_delete_product", () => {
    it("calls DELETE /products/{productId}", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_delete_product")({ productId: 7 });
        expect(mockMutate).toHaveBeenCalledWith("DELETE", "/companies/test-slug/products/7");
    });
    errorTests("fiken_delete_product", mockMutate, { productId: 7 });
});
