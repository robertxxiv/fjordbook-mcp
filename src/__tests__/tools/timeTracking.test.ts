import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
    get: vi.fn(),
    mutate: vi.fn(),
    cp: vi.fn((path: string) => `/companies/test-slug${path}`),
    slug: vi.fn(() => "test-slug"),
}));

import { get, mutate } from "../../client.js";
import { register } from "../../tools/timeTracking.js";
import { createMockServer } from "../helpers.js";

const mockGet = vi.mocked(get);
const mockMutate = vi.mocked(mutate);
const server = createMockServer();

beforeAll(() => {
    register(server);
});
beforeEach(() => {
    vi.clearAllMocks();
});

const PREFIX = "/companies/test-slug";
const data = { result: 1 };
const json = JSON.stringify(data, null, 2);

const getCases: Array<[string, Record<string, unknown>, string, boolean]> = [
    [
        "fiken_list_projects",
        { page: 0, pageSize: 10, completed: false, name: "A", number: "P1" },
        "/projects",
        true,
    ],
    ["fiken_get_project", { projectId: 3 }, "/projects/3", false],
    [
        "fiken_list_activities",
        { page: 0, pageSize: 25, name: "Dev", archived: false },
        "/activities",
        true,
    ],
    ["fiken_get_activity", { activityId: 4 }, "/activities/4", false],
    [
        "fiken_list_time_entries",
        {
            page: 0,
            pageSize: 50,
            date: "2024-01-01",
            dateGe: "2024-01-01",
            dateLe: "2024-01-31",
            projectId: 5,
            activityId: 6,
            timeUserId: 2,
            invoiced: false,
            lastModifiedGe: "2024-01-01T00:00:00Z",
            lastModifiedLe: "2024-02-01T00:00:00Z",
        },
        "/timeEntries",
        true,
    ],
    ["fiken_get_time_entry", { timeEntryId: 8 }, "/timeEntries/8", false],
    [
        "fiken_list_time_users",
        { page: 0, pageSize: 25, name: "Al", email: "a@b.no" },
        "/timeUsers",
        true,
    ],
    ["fiken_get_time_user", { timeUserId: 9 }, "/timeUsers/9", false],
];

describe.each(getCases)("%s", (tool, args, path, passesParams) => {
    it("calls GET with the exact path and params", async () => {
        mockGet.mockResolvedValue(data);
        const result = await server.getHandler(tool)(args);
        if (passesParams) expect(mockGet).toHaveBeenCalledWith(PREFIX + path, args);
        else expect(mockGet).toHaveBeenCalledWith(PREFIX + path);
        expect(result.content[0].text).toBe(json);
    });
    it("returns error on failure", async () => {
        mockGet.mockRejectedValue(new Error("Fiken 404: Not Found"));
        const result = await server.getHandler(tool)(args);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Fiken 404: Not Found");
    });
    it("handles non-Error thrown values", async () => {
        mockGet.mockRejectedValue({ code: 500 });
        const result = await server.getHandler(tool)(args);
        expect(result.content[0].text).toBe("Error: [object Object]");
    });
});

// [tool, method, args, path, id key stripped from body]
const mutateCases: Array<[string, string, Record<string, unknown>, string]> = [
    [
        "fiken_create_project",
        "POST",
        {
            number: "P1",
            name: "Alpha",
            startDate: "2024-01-01",
            endDate: "2024-12-31",
            contactId: 1,
            completed: false,
            description: "d",
        },
        "/projects",
    ],
    [
        "fiken_update_project",
        "PATCH",
        { projectId: 3, name: "Beta", completed: true },
        "/projects/3",
    ],
    ["fiken_delete_project", "DELETE", { projectId: 3 }, "/projects/3"],
    [
        "fiken_create_activity",
        "POST",
        {
            name: "Dev",
            hourlyRate: 125000,
            productId: 1,
            billable: true,
            description: "d",
            projectId: 2,
        },
        "/activities",
    ],
    ["fiken_update_activity", "PATCH", { activityId: 4, hourlyRate: 100000 }, "/activities/4"],
    ["fiken_delete_activity", "DELETE", { activityId: 4 }, "/activities/4"],
    [
        "fiken_create_time_entry",
        "POST",
        {
            date: "2024-01-02",
            hours: 7.5,
            startTime: "08:00",
            description: "d",
            internalNote: "n",
            activityId: 6,
            projectId: 5,
            timeUserId: 2,
        },
        "/timeEntries",
    ],
    [
        "fiken_update_time_entry",
        "PATCH",
        { timeEntryId: 8, hours: 2.5, description: "x" },
        "/timeEntries/8",
    ],
    ["fiken_delete_time_entry", "DELETE", { timeEntryId: 8 }, "/timeEntries/8"],
    [
        "fiken_create_invoice_draft_from_time_entries",
        "POST",
        {
            timeEntryIds: [1, 2],
            customerId: 10,
            daysUntilDueDate: 14,
            groupBy: "activityAndPerson",
            includeTimeEntryDescriptions: true,
            issueDate: "2024-03-01",
            projectId: 5,
            invoiceText: "t",
            yourReference: "y",
            ourReference: "o",
            orderReference: "r",
            currency: "NOK",
            bankAccountNumber: "12345678901",
        },
        "/timeEntries/createInvoiceDraft",
    ],
];

describe.each(mutateCases)("%s", (tool, method, args, path) => {
    const idKey = Object.keys(args).find((k) => /Id$/.test(k) && path.includes(String(args[k])));
    const hasPathId = method !== "POST" && idKey !== undefined;
    const expectedBody = (() => {
        if (method === "DELETE") return undefined;
        if (!hasPathId) return args;
        const { [idKey!]: _omit, ...rest } = args;
        return rest;
    })();

    it(`calls ${method} with the exact path and body`, async () => {
        mockMutate.mockResolvedValue(data);
        const result = await server.getHandler(tool)(args);
        if (expectedBody === undefined) {
            expect(mockMutate).toHaveBeenCalledWith(method, PREFIX + path);
        } else {
            expect(mockMutate).toHaveBeenCalledWith(method, PREFIX + path, expectedBody);
        }
        expect(result.content[0].text).toBe(json);
    });
    it("returns error on failure", async () => {
        mockMutate.mockRejectedValue(new Error("Fiken 400: Bad Request"));
        const result = await server.getHandler(tool)(args);
        expect(result.isError).toBe(true);
    });
    it("handles non-Error thrown values", async () => {
        mockMutate.mockRejectedValue("boom");
        const result = await server.getHandler(tool)(args);
        expect(result.content[0].text).toBe("Error: boom");
    });
});
