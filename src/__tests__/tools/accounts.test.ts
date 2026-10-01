import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate } from "../../client.js";
import { register } from "../../tools/accounts.js";
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

describe("fiken_list_accounts", () => {
    it("calls GET /accounts with params", async () => {
        const data = [{ code: "1920", name: "Bank" }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = {
            fromAccount: 1000,
            toAccount: 9999,
            page: 0,
            pageSize: 25,
            range: "1000-1500, 2000",
        };
        const result = await server.getHandler("fiken_list_accounts")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/accounts", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 403: Forbidden"));
        const result = await server.getHandler("fiken_list_accounts")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Fiken 403: Forbidden");
    });

    it("handles non-Error thrown values", async () => {
        mockGetWithMeta.mockRejectedValue("timeout");
        const result = await server.getHandler("fiken_list_accounts")({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: timeout");
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_accounts")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_get_account", () => {
    it("calls GET /accounts/{accountCode}", async () => {
        const data = { code: "3020", name: "Sales" };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_account")({ accountCode: "3020" });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/accounts/3020");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_account")({ accountCode: "9999" });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_list_account_balances", () => {
    it("calls GET /accountBalances with params", async () => {
        const data = [{ account: { code: "1920" }, balance: 100000 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = {
            date: "2024-12-31",
            fromAccount: 1000,
            toAccount: 9999,
            page: 0,
            pageSize: 25,
        };
        const result = await server.getHandler("fiken_list_account_balances")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith(
            "/companies/test-slug/accountBalances",
            params,
        );
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 500: Server Error"));
        const result = await server.getHandler("fiken_list_account_balances")({
            date: "2024-01-01",
        });
        expect(result.isError).toBe(true);
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_account_balances")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_get_account_balance", () => {
    it("calls GET /accountBalances/{accountCode} with date", async () => {
        const data = { account: { code: "1920" }, balance: 500000 };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_account_balance")({
            accountCode: "1920",
            date: "2024-12-31",
        });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/accountBalances/1920", {
            date: "2024-12-31",
        });
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_account_balance")({
            accountCode: "0000",
            date: "2024-01-01",
        });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_list_bank_accounts", () => {
    it("calls GET /bankAccounts with params", async () => {
        const data = [{ bankAccountId: 1, name: "Main Account" }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10, inactive: false };
        const result = await server.getHandler("fiken_list_bank_accounts")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/bankAccounts", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 401: Unauthorized"));
        const result = await server.getHandler("fiken_list_bank_accounts")({});
        expect(result.isError).toBe(true);
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_bank_accounts")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_bank_account", () => {
    it("calls POST /bankAccounts with body", async () => {
        mockMutate.mockResolvedValue({
            created: true,
            location: "/companies/test-slug/bankAccounts/2",
        });
        const body = {
            name: "New Account",
            bankAccountNumber: "12345678903",
            type: "normal" as const,
        };
        const result = await server.getHandler("fiken_create_bank_account")(body);
        expect(mockMutate).toHaveBeenCalledWith("POST", "/companies/test-slug/bankAccounts", body);
        expect(result.content[0].text).toContain("created");
    });

    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler("fiken_create_bank_account")({ name: "Bad" });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_get_bank_account", () => {
    it("calls GET /bankAccounts/{bankAccountId}", async () => {
        const data = { bankAccountId: 1, name: "Main Account" };
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler("fiken_get_bank_account")({ bankAccountId: 1 });
        expect(mockGet).toHaveBeenCalledWith("/companies/test-slug/bankAccounts/1");
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler("fiken_get_bank_account")({ bankAccountId: 999 });
        expect(result.isError).toBe(true);
    });
});

describe("fiken_list_bank_balances", () => {
    it("calls GET /bankBalances with params", async () => {
        const data = [{ bankAccount: { bankAccountId: 1 }, balance: 250000 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { date: "2024-12-31", page: 0, pageSize: 10 };
        const result = await server.getHandler("fiken_list_bank_balances")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith("/companies/test-slug/bankBalances", params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });

    it("returns error on failure", async () => {
        mockGetWithMeta.mockRejectedValue(new Error("Fiken 500: Server Error"));
        const result = await server.getHandler("fiken_list_bank_balances")({});
        expect(result.isError).toBe(true);
    });
    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_bank_balances")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("account code schema", () => {
    type Cfg = { inputSchema: { safeParse: (v: unknown) => { success: boolean } } };
    const configs = new Map<string, Cfg>();
    beforeAll(() => {
        register({
            registerTool: (name: string, config: Cfg) => configs.set(name, config),
        } as never);
    });

    it.each(["fiken_get_account", "fiken_get_account_balance"])(
        "%s accepts only 4-digit codes with optional sub-account",
        (name) => {
            const schema = configs.get(name)!.inputSchema;
            const base = name === "fiken_get_account" ? {} : { date: "2024-01-01" };
            for (const ok of ["3020", "1500:10001"]) {
                expect(schema.safeParse({ ...base, accountCode: ok }).success).toBe(true);
            }
            for (const bad of ["../users", "3020/x", "302", "3020:", "3020?x=1", "abcd"]) {
                expect(schema.safeParse({ ...base, accountCode: bad }).success).toBe(false);
            }
        },
    );
});
