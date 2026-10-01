import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta } from "../../client.js";
import { register } from "../../tools/user.js";
import { createMockServer } from "../helpers.js";

const mockGet = vi.mocked(get);
const mockGetWithMeta = vi.mocked(getWithMeta);
const server = createMockServer();

beforeAll(() => {
    register(server);
});
beforeEach(() => {
    vi.clearAllMocks();
});

describe("fiken_get_user", () => {
    it("calls GET /user and returns result", async () => {
        const data = { name: "Test User", email: "test@fiken.no" };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_user")({});
        expect(mockGet).toHaveBeenCalledWith("/user");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
        expect(result.isError).toBeUndefined();
    });

    it("returns error response on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 401: Unauthorized"));
        const result = await server.getHandler("fiken_get_user")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 401: Unauthorized");
    });

    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue("string error");
        const result = await server.getHandler("fiken_get_user")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: string error");
    });
});

describe("fiken_list_companies", () => {
    it("calls GET /companies with params", async () => {
        const data = [{ slug: "my-co" }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10, sortBy: "name asc" };
        const result = await server.getHandler("fiken_list_companies")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 500: Server Error"));
        const result = await server.getHandler("fiken_list_companies")({});
        expect(result.isError).toBe(true);
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_companies")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_get_company", () => {
    it('calls GET cp("") and returns company', async () => {
        const data = { name: "Test Company", slug: "test-slug" };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_company")({});
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_company")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Fiken 404: Not Found");
    });
});
