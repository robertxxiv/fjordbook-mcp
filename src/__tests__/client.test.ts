import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Inline fetch mock before importing client
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { get, getWithMeta, mutate, cp, slug, uploadMultipart, _resetForTests } from "../client.js";

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    const headersMap = new Map(Object.entries(headers));
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name: string) => headersMap.get(name) ?? null },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    };
}

describe("client", () => {
    const ORIG_TOKEN = process.env.FIKEN_API_TOKEN;
    const ORIG_SLUG = process.env.FIKEN_COMPANY_SLUG;

    beforeEach(() => {
        process.env.FIKEN_API_TOKEN = "test-token";
        process.env.FIKEN_COMPANY_SLUG = "test-slug";
        delete process.env.FIKEN_TIMEOUT_MS;
        mockFetch.mockReset();
        _resetForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
        process.env.FIKEN_API_TOKEN = ORIG_TOKEN;
        process.env.FIKEN_COMPANY_SLUG = ORIG_SLUG;
    });

    describe("slug()", () => {
        it("returns FIKEN_COMPANY_SLUG env var", () => {
            expect(slug()).toBe("test-slug");
        });

        it("throws when FIKEN_COMPANY_SLUG is not set", () => {
            delete process.env.FIKEN_COMPANY_SLUG;
            expect(() => slug()).toThrow("FIKEN_COMPANY_SLUG environment variable is required");
        });
    });

    describe("cp()", () => {
        it("builds company-scoped path", () => {
            expect(cp("/invoices")).toBe("/companies/test-slug/invoices");
        });

        it("handles empty path suffix", () => {
            expect(cp("")).toBe("/companies/test-slug");
        });
    });

    describe("get()", () => {
        it("throws when FIKEN_API_TOKEN is not set", async () => {
            delete process.env.FIKEN_API_TOKEN;
            await expect(get("/user")).rejects.toThrow(
                "FIKEN_API_TOKEN environment variable is required",
            );
        });

        it("fetches with Bearer auth header", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, { name: "Test" }));
            await get("/user");
            expect(mockFetch).toHaveBeenCalledOnce();
            const [url, init] = mockFetch.mock.calls[0];
            expect(String(url)).toBe("https://api.fiken.no/api/v2/user");
            expect(init.headers.Authorization).toBe("Bearer test-token");
        });

        it("returns parsed JSON on 200", async () => {
            const data = { id: 1, name: "Test" };
            mockFetch.mockResolvedValue(makeResponse(200, data));
            const result = await get("/user");
            expect(result).toEqual(data);
        });

        it("returns null on 204", async () => {
            mockFetch.mockResolvedValue(makeResponse(204, null));
            const result = await get("/user");
            expect(result).toBeNull();
        });

        it("throws on non-ok response", async () => {
            mockFetch.mockResolvedValue(makeResponse(404, "Not found"));
            await expect(get("/user")).rejects.toThrow("Fiken 404: Not found");
        });

        it("throws on 500 error", async () => {
            mockFetch.mockResolvedValue(makeResponse(500, "Internal Server Error"));
            await expect(get("/user")).rejects.toThrow("Fiken 500: Internal Server Error");
        });

        it("appends non-null params as query string", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, []));
            await get("/companies", { page: 0, pageSize: 10, sortBy: "name asc" });
            const [url] = mockFetch.mock.calls[0];
            const u = new URL(String(url));
            expect(u.searchParams.get("page")).toBe("0");
            expect(u.searchParams.get("pageSize")).toBe("10");
            expect(u.searchParams.get("sortBy")).toBe("name asc");
        });

        it("skips null and undefined params", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, []));
            await get("/contacts", { page: 1, name: null, inactive: undefined });
            const [url] = mockFetch.mock.calls[0];
            const u = new URL(String(url));
            expect(u.searchParams.get("page")).toBe("1");
            expect(u.searchParams.has("name")).toBe(false);
            expect(u.searchParams.has("inactive")).toBe(false);
        });

        it("works with no params", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, {}));
            await get("/user");
            const [url] = mockFetch.mock.calls[0];
            expect(String(url)).toBe("https://api.fiken.no/api/v2/user");
        });

        it("converts boolean param to string", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, []));
            await get("/contacts", { customer: true });
            const [url] = mockFetch.mock.calls[0];
            const u = new URL(String(url));
            expect(u.searchParams.get("customer")).toBe("true");
        });
    });

    describe("mutate()", () => {
        it("throws when FIKEN_API_TOKEN is not set", async () => {
            delete process.env.FIKEN_API_TOKEN;
            await expect(mutate("POST", "/companies/test-slug/invoices", {})).rejects.toThrow(
                "FIKEN_API_TOKEN environment variable is required",
            );
        });

        it("sends POST with body and correct headers", async () => {
            mockFetch.mockResolvedValue(makeResponse(204, null));
            await mutate("POST", "/companies/test-slug/invoices", { issueDate: "2024-01-01" });
            const [url, init] = mockFetch.mock.calls[0];
            expect(String(url)).toBe("https://api.fiken.no/api/v2/companies/test-slug/invoices");
            expect(init.method).toBe("POST");
            expect(init.headers.Authorization).toBe("Bearer test-token");
            expect(init.headers["Content-Type"]).toBe("application/json");
            expect(init.body).toBe(JSON.stringify({ issueDate: "2024-01-01" }));
        });

        it("sends no body when body is undefined", async () => {
            mockFetch.mockResolvedValue(makeResponse(204, null));
            await mutate("DELETE", "/companies/test-slug/contacts/1");
            const [, init] = mockFetch.mock.calls[0];
            expect(init.body).toBeUndefined();
        });

        it("returns {success: true} on 204", async () => {
            mockFetch.mockResolvedValue(makeResponse(204, null));
            const result = await mutate("DELETE", "/companies/test-slug/contacts/1");
            expect(result).toEqual({ success: true });
        });

        it("returns {created: true, location} on 201", async () => {
            mockFetch.mockResolvedValue(
                makeResponse(201, null, { Location: "/companies/test-slug/invoices/99" }),
            );
            const result = (await mutate("POST", "/companies/test-slug/invoices", {})) as Record<
                string,
                unknown
            >;
            expect(result).toEqual({ created: true, location: "/companies/test-slug/invoices/99" });
        });

        it("returns parsed JSON on 200", async () => {
            const data = { saleId: 5 };
            mockFetch.mockResolvedValue(makeResponse(200, data));
            const result = await mutate("POST", "/companies/test-slug/sales", {});
            expect(result).toEqual(data);
        });

        it("returns {success: true} when 200 body is not valid JSON", async () => {
            const badResponse = {
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: () => Promise.reject(new SyntaxError("bad json")),
                text: () => Promise.resolve("ok"),
            };
            mockFetch.mockResolvedValue(badResponse);
            const result = await mutate("PATCH", "/some/path");
            expect(result).toEqual({ success: true });
        });

        it("throws on non-ok response", async () => {
            mockFetch.mockResolvedValue(makeResponse(400, "Bad Request"));
            await expect(mutate("POST", "/companies/test-slug/invoices", {})).rejects.toThrow(
                "Fiken 400: Bad Request",
            );
        });

        it("sends PUT with body", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, { id: 1 }));
            await mutate("PUT", "/companies/test-slug/contacts/1", { name: "Updated" });
            const [, init] = mockFetch.mock.calls[0];
            expect(init.method).toBe("PUT");
            expect(init.body).toBe(JSON.stringify({ name: "Updated" }));
        });

        it("sends PATCH with body", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, {}));
            await mutate("PATCH", "/path", { dueDate: "2024-12-31" });
            const [, init] = mockFetch.mock.calls[0];
            expect(init.method).toBe("PATCH");
        });
    });

    describe("uploadMultipart()", () => {
        it("throws when FIKEN_API_TOKEN is not set", async () => {
            delete process.env.FIKEN_API_TOKEN;
            await expect(
                uploadMultipart("/companies/test-slug/purchases/1/attachments", {}, new FormData()),
            ).rejects.toThrow("FIKEN_API_TOKEN environment variable is required");
        });

        it("sends POST with auth, query params, and multipart body", async () => {
            mockFetch.mockResolvedValue(
                makeResponse(201, null, {
                    Location: "/companies/test-slug/purchases/1/attachments/2",
                }),
            );
            const form = new FormData();
            form.append("filename", "receipt.pdf");
            form.append("file", new Blob([Buffer.from("pdf")]), "receipt.pdf");

            const result = await uploadMultipart(
                "/companies/test-slug/purchases/1/attachments",
                { attachToPayment: false, attachToSale: true },
                form,
            );

            const [url, init] = mockFetch.mock.calls[0];
            const u = new URL(String(url));
            expect(u.pathname).toBe("/api/v2/companies/test-slug/purchases/1/attachments");
            expect(u.searchParams.get("attachToPayment")).toBe("false");
            expect(u.searchParams.get("attachToSale")).toBe("true");
            expect(init.method).toBe("POST");
            expect(init.headers.Authorization).toBe("Bearer test-token");
            expect(init.headers["Content-Type"]).toBeUndefined();
            expect(init.body).toBe(form);
            expect(result).toEqual({
                created: true,
                location: "/companies/test-slug/purchases/1/attachments/2",
            });
        });

        it("throws on non-ok response", async () => {
            mockFetch.mockResolvedValue(makeResponse(400, "Bad Request"));
            await expect(
                uploadMultipart("/companies/test-slug/purchases/1/attachments", {}, new FormData()),
            ).rejects.toThrow("Fiken 400: Bad Request");
        });
    });

    describe("getWithMeta()", () => {
        it("parses pagination headers", async () => {
            mockFetch.mockResolvedValue(
                makeResponse(200, [1], {
                    "Fiken-Api-Page": "0",
                    "Fiken-Api-Page-Size": "25",
                    "Fiken-Api-Page-Count": "4",
                    "Fiken-Api-Result-Count": "100",
                }),
            );
            expect(await getWithMeta("/x", { page: 0, pageSize: 25 })).toEqual({
                data: [1],
                pagination: { page: 0, pageSize: 25, pageCount: 4, resultCount: 100 },
            });
        });

        it("returns pagination undefined when headers are absent", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, { a: 1 }));
            expect(await getWithMeta("/x")).toEqual({ data: { a: 1 }, pagination: undefined });
        });

        it("keeps valid headers and drops unparsable ones", async () => {
            mockFetch.mockResolvedValue(
                makeResponse(200, [], { "Fiken-Api-Page-Count": "3", "Fiken-Api-Page": "abc" }),
            );
            const { pagination } = await getWithMeta("/x");
            expect(pagination).toEqual({
                page: undefined,
                pageSize: undefined,
                pageCount: 3,
                resultCount: undefined,
            });
        });

        it("returns null data on 204", async () => {
            mockFetch.mockResolvedValue(makeResponse(204, null));
            expect((await getWithMeta("/x")).data).toBeNull();
        });

        it("throws on non-ok response", async () => {
            mockFetch.mockResolvedValue(makeResponse(404, "nope"));
            await expect(getWithMeta("/x")).rejects.toThrow("Fiken 404: nope");
        });
    });

    describe("auth errors", () => {
        it.each([401, 403])("adds a token hint on %i without echoing the token", async (status) => {
            mockFetch.mockResolvedValue(makeResponse(status, "Unauthorized"));
            const err = await get("/user").catch((e: Error) => e);
            expect((err as Error).message).toContain(`Fiken ${status}: Unauthorized`);
            expect((err as Error).message).toContain("FIKEN_API_TOKEN");
            expect((err as Error).message).not.toContain("test-token");
        });

        it("adds the hint for mutations too", async () => {
            mockFetch.mockResolvedValue(makeResponse(401, "no"));
            await expect(mutate("POST", "/p", {})).rejects.toThrow("check that FIKEN_API_TOKEN");
        });
    });

    describe("queue and pacing", () => {
        beforeEach(() => vi.useFakeTimers());

        it("never has more than one request in flight and spaces starts by 250ms", async () => {
            let inFlight = 0;
            let maxInFlight = 0;
            const starts: number[] = [];
            mockFetch.mockImplementation(async () => {
                starts.push(Date.now());
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((r) => setTimeout(r, 10));
                inFlight--;
                return makeResponse(200, {});
            });
            const all = Promise.all([
                get("/a"),
                mutate("POST", "/b", {}),
                uploadMultipart("/c", undefined, new FormData()),
            ]);
            await vi.runAllTimersAsync();
            await all;
            expect(maxInFlight).toBe(1);
            expect(starts).toHaveLength(3);
            expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(250);
            expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(250);
        });

        it("does not delay the first request or one after a quiet period", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, {}));
            await get("/a");
            expect(mockFetch).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(300);
            await get("/b");
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it("keeps the queue alive after a failed request", async () => {
            mockFetch.mockResolvedValueOnce(makeResponse(400, "bad"));
            mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: 1 }));
            const first = get("/a").catch((e: Error) => e);
            const second = get("/b");
            await vi.runAllTimersAsync();
            expect(await first).toBeInstanceOf(Error);
            expect(await second).toEqual({ ok: 1 });
        });
    });

    describe("timeout", () => {
        const timeoutErr = () => new DOMException("timed out", "TimeoutError");

        it("passes an abort signal to fetch", async () => {
            mockFetch.mockResolvedValue(makeResponse(200, {}));
            await get("/a");
            expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        });

        it("honours FIKEN_TIMEOUT_MS and reports a clear error for POST (no retry)", async () => {
            process.env.FIKEN_TIMEOUT_MS = "1234";
            mockFetch.mockRejectedValue(timeoutErr());
            const err = await mutate("POST", "/x", {}).catch((e: Error) => e);
            expect((err as Error).message).toBe("Fiken request timed out after 1234ms: POST /x");
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it.each(["abc", "0", "-5"])("falls back to 30000ms for FIKEN_TIMEOUT_MS=%s", async (v) => {
            process.env.FIKEN_TIMEOUT_MS = v;
            mockFetch.mockRejectedValue(timeoutErr());
            await expect(mutate("PUT", "/x")).rejects.toThrow("timed out after 30000ms: PUT /x");
        });

        it("retries GET timeouts then reports the timeout", async () => {
            vi.useFakeTimers();
            mockFetch.mockRejectedValue(timeoutErr());
            const p = get("/x").catch((e: Error) => e);
            await vi.runAllTimersAsync();
            expect((await p) as Error).toHaveProperty(
                "message",
                "Fiken request timed out after 30000ms: GET /x",
            );
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });
    });

    describe("retries", () => {
        beforeEach(() => vi.useFakeTimers());

        it("retries GET network errors, then succeeds", async () => {
            mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
            mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
            mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: true }));
            const p = get("/x");
            await vi.runAllTimersAsync();
            expect(await p).toEqual({ ok: true });
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it("rethrows the original GET network error after 3 retries", async () => {
            mockFetch.mockRejectedValue(new TypeError("fetch failed"));
            const p = get("/x").catch((e: Error) => e);
            await vi.runAllTimersAsync();
            expect(((await p) as Error).message).toBe("fetch failed");
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it("does not retry non-GET network errors", async () => {
            mockFetch.mockRejectedValue(new TypeError("fetch failed"));
            await expect(mutate("POST", "/x", {})).rejects.toThrow("fetch failed");
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("rethrows non-Error rejections untouched", async () => {
            mockFetch.mockRejectedValue("boom");
            await expect(mutate("DELETE", "/x")).rejects.toBe("boom");
        });

        it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])(
            "retries %s on 429 with exponential backoff",
            async (method) => {
                mockFetch.mockResolvedValueOnce(makeResponse(429, "slow"));
                mockFetch.mockResolvedValueOnce(makeResponse(503, "busy"));
                mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: 1 }));
                const p = method === "GET" ? get("/x") : mutate(method, "/x", {});
                await vi.runAllTimersAsync();
                expect(await p).toEqual({ ok: 1 });
                expect(mockFetch).toHaveBeenCalledTimes(3);
            },
        );

        it("retries uploadMultipart on 429", async () => {
            mockFetch.mockResolvedValueOnce(makeResponse(429, "slow"));
            mockFetch.mockResolvedValueOnce(makeResponse(204, null));
            const p = uploadMultipart("/x", undefined, new FormData());
            await vi.runAllTimersAsync();
            expect(await p).toEqual({ success: true });
        });

        it("honours Retry-After seconds", async () => {
            mockFetch.mockResolvedValueOnce(makeResponse(429, "slow", { "Retry-After": "5" }));
            mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
            const p = get("/x");
            await vi.advanceTimersByTimeAsync(4900);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(200);
            expect(mockFetch).toHaveBeenCalledTimes(2);
            await p;
        });

        it("caps Retry-After and ignores garbage values", async () => {
            mockFetch.mockResolvedValueOnce(makeResponse(429, "x", { "Retry-After": "99999" }));
            mockFetch.mockResolvedValueOnce(makeResponse(429, "x", { "Retry-After": "soon" }));
            mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
            const p = get("/x");
            await vi.advanceTimersByTimeAsync(60_000);
            expect(mockFetch).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(1000);
            expect(mockFetch).toHaveBeenCalledTimes(3);
            await p;
        });

        it("gives up after 3 retries and surfaces the error", async () => {
            mockFetch.mockResolvedValue(makeResponse(429, "Too many"));
            const p = get("/x").catch((e: Error) => e);
            await vi.runAllTimersAsync();
            expect(((await p) as Error).message).toBe("Fiken 429: Too many");
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it("does not retry other 5xx", async () => {
            mockFetch.mockResolvedValue(makeResponse(500, "err"));
            await expect(get("/x")).rejects.toThrow("Fiken 500: err");
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });
});
