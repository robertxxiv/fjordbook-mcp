import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    getWithMeta: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, getWithMeta, mutate } from "../../client.js";
import { register } from "../../tools/recurringInvoices.js";
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

const base = "/companies/test-slug/recurringInvoices";
const lines = [{ description: "Hosting", unitPrice: 10000, vatType: "HIGH", quantity: 1 }];
const frequency = { interval: 1, intervalUnit: "MONTH" };

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

describe("fiken_list_recurring_invoices", () => {
    it("calls GET /recurringInvoices with filters", async () => {
        const data = [{ recurringInvoiceId: 1 }];
        mockGetWithMeta.mockResolvedValue({ data: data, pagination: undefined });
        const params = { page: 0, pageSize: 10, customerId: 4, active: true };
        const result = await server.getHandler("fiken_list_recurring_invoices")(params);
        expect(mockGetWithMeta).toHaveBeenCalledWith(base, params);
        expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
    });
    errorTests("fiken_list_recurring_invoices", mockGetWithMeta, {});

    it("wraps items with pagination when present", async () => {
        const pagination = { page: 1, pageSize: 25, pageCount: 3, resultCount: 60 };
        mockGetWithMeta.mockResolvedValue({ data: [{ id: 1 }], pagination });
        const result = await server.getHandler("fiken_list_recurring_invoices")({});
        expect(result.content[0].text).toBe(
            JSON.stringify({ items: [{ id: 1 }], pagination }, null, 2),
        );
    });
});

describe("fiken_create_recurring_invoice", () => {
    const body = {
        customerId: 4,
        startDate: "2026-01-01",
        daysUntilDueDate: 14,
        frequency,
        bankAccountNumber: "11112233334",
        lines,
    };
    it("calls POST /recurringInvoices with body", async () => {
        mockMutate.mockResolvedValue({ created: true });
        const result = await server.getHandler("fiken_create_recurring_invoice")(body);
        expect(mockMutate).toHaveBeenCalledWith("POST", base, body);
        expect(result.content[0].text).toContain("created");
    });
    errorTests("fiken_create_recurring_invoice", mockMutate, body);
});

describe("fiken_get_recurring_invoice", () => {
    it("calls GET /recurringInvoices/{id}", async () => {
        mockGet.mockResolvedValue({ recurringInvoiceId: 3 });
        await server.getHandler("fiken_get_recurring_invoice")({ recurringInvoiceId: 3 });
        expect(mockGet).toHaveBeenCalledWith(`${base}/3`);
    });
    errorTests("fiken_get_recurring_invoice", mockGet, { recurringInvoiceId: 3 });
});

describe("fiken_update_recurring_invoice_lines", () => {
    const params = { recurringInvoiceId: 3, lines, roundingType: "none" };
    it("calls PUT /recurringInvoices/{id}/lines with body", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_update_recurring_invoice_lines")(params);
        expect(mockMutate).toHaveBeenCalledWith("PUT", `${base}/3/lines`, {
            lines,
            roundingType: "none",
        });
    });
    errorTests("fiken_update_recurring_invoice_lines", mockMutate, params);
});

describe("fiken_update_recurring_invoice_frequency", () => {
    const params = { recurringInvoiceId: 3, description: "d", frequency, daysUntilDueDate: 10 };
    it("calls PUT /recurringInvoices/{id}/frequency with body", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_update_recurring_invoice_frequency")(params);
        expect(mockMutate).toHaveBeenCalledWith("PUT", `${base}/3/frequency`, {
            description: "d",
            frequency,
            daysUntilDueDate: 10,
        });
    });
    errorTests("fiken_update_recurring_invoice_frequency", mockMutate, params);
});

describe("fiken_add_recurring_invoice_job", () => {
    const params = {
        recurringInvoiceId: 3,
        customerId: 9,
        contactPersonIds: [1, 2],
        nextDate: "2026-02-01",
    };
    it("calls POST /recurringInvoices/{id}/jobs with body", async () => {
        mockMutate.mockResolvedValue({ created: true });
        await server.getHandler("fiken_add_recurring_invoice_job")(params);
        expect(mockMutate).toHaveBeenCalledWith("POST", `${base}/3/jobs`, {
            customerId: 9,
            contactPersonIds: [1, 2],
            nextDate: "2026-02-01",
        });
    });
    errorTests("fiken_add_recurring_invoice_job", mockMutate, params);
});

describe("fiken_update_recurring_invoice_job_schedule", () => {
    const params = {
        recurringInvoiceId: 3,
        jobId: 8,
        nextDate: "2026-03-01",
        endDate: "2027-01-01",
    };
    it("calls PUT /recurringInvoices/{id}/jobs/{jobId}/schedule with body", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_update_recurring_invoice_job_schedule")(params);
        expect(mockMutate).toHaveBeenCalledWith("PUT", `${base}/3/jobs/8/schedule`, {
            nextDate: "2026-03-01",
            endDate: "2027-01-01",
        });
    });
    errorTests("fiken_update_recurring_invoice_job_schedule", mockMutate, params);
});

describe("fiken_update_recurring_invoice_job_recipients", () => {
    const recipients = {
        emails: ["a@b.no"],
        contactPersonIds: [1],
        ehf: false,
        efaktura: false,
        letter: true,
        smsPhoneNumber: null,
    };
    const params = { recurringInvoiceId: 3, jobId: 8, ...recipients };
    it("calls PUT /recurringInvoices/{id}/jobs/{jobId}/recipients with body", async () => {
        mockMutate.mockResolvedValue({ success: true });
        await server.getHandler("fiken_update_recurring_invoice_job_recipients")(params);
        expect(mockMutate).toHaveBeenCalledWith("PUT", `${base}/3/jobs/8/recipients`, recipients);
    });
    errorTests("fiken_update_recurring_invoice_job_recipients", mockMutate, params);
});

describe.each(["pause", "resume", "stop"])("fiken_%s_recurring_invoice_job", (action) => {
    const tool = `fiken_${action}_recurring_invoice_job`;
    const params = { recurringInvoiceId: 3, jobId: 8 };
    it(`calls POST /recurringInvoices/{id}/jobs/{jobId}/${action}`, async () => {
        mockMutate.mockResolvedValue({ success: true });
        const result = await server.getHandler(tool)(params);
        expect(mockMutate).toHaveBeenCalledWith("POST", `${base}/3/jobs/8/${action}`);
        expect(result.content[0].text).toContain("success");
    });
    errorTests(tool, mockMutate, params);
});
