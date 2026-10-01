import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, W, D, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

const paging = z.object({ page: pageField, pageSize: pageSizeField });

const date = (what: string) => z.string().describe(`${what}, format YYYY-MM-DD`);

const activityFields = {
    name: z.string().describe("Name of the activity (must be unique within the company)"),
    hourlyRate: z
        .number()
        .int()
        .optional()
        .describe("Default hourly rate in cents (125000 = 1250.00)"),
    productId: z
        .number()
        .int()
        .optional()
        .describe("ID of the product used when invoicing this activity"),
    billable: z
        .boolean()
        .optional()
        .describe("Whether time entries with this activity are billable by default"),
    description: z.string().optional().describe("Description of the activity"),
    projectId: z.number().int().optional().describe("ID of the project this activity belongs to"),
};

const projectFields = {
    name: z.string().describe("Project name"),
    description: z.string().optional(),
    startDate: date("Start date for the project, inclusive"),
    endDate: date("End date for the project, inclusive").optional(),
    contactId: z.number().int().optional().describe("ID of the contact (customer) for the project"),
    completed: z.boolean().optional().describe("Whether the project is completed"),
};

const timeEntryFields = {
    date: date("Date of the time entry"),
    hours: z.number().describe("Number of hours worked (decimal, e.g. 7.5)"),
    startTime: z.string().optional().describe("Start time of the work, format HH:mm"),
    description: z
        .string()
        .optional()
        .describe("Description of work performed (visible on invoices)"),
    internalNote: z.string().optional().describe("Internal note (not visible on invoices)"),
    activityId: z.number().int().describe("ID of the activity this time entry belongs to"),
    projectId: z.number().int().optional().describe("ID of the project this time entry belongs to"),
};

export function register(server: McpServer) {
    // Projects
    server.registerTool(
        "fiken_list_projects",
        {
            ...R,
            description: "Returns all projects for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                completed: z.boolean().optional().describe("Filter on completed / not completed"),
                name: z.string().optional().describe("Filter on project name"),
                number: z.string().optional().describe("Filter on project number"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/projects"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_project",
        {
            ...W,
            description: "Creates a new project",
            inputSchema: z.object({
                number: z.string().describe("Project number (required)"),
                ...projectFields,
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/projects"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_project",
        {
            ...R,
            description: "Returns a specific project by ID",
            inputSchema: z.object({ projectId: z.number().int() }),
        },
        async ({ projectId }) => {
            try {
                return ok(await get(cp(`/projects/${projectId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_project",
        {
            ...W,
            description: "Updates a project (PATCH: only the supplied fields are changed)",
            inputSchema: z.object({
                projectId: z.number().int(),
                ...projectFields,
                name: projectFields.name.optional(),
                startDate: projectFields.startDate.optional(),
            }),
        },
        async ({ projectId, ...body }) => {
            try {
                return ok(await mutate("PATCH", cp(`/projects/${projectId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_project",
        {
            ...D,
            description: "Deletes a project",
            inputSchema: z.object({ projectId: z.number().int() }),
        },
        async ({ projectId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/projects/${projectId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    // Activities
    server.registerTool(
        "fiken_list_activities",
        {
            ...R,
            description: "Returns all activity types for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                name: z.string().optional().describe("Filter by name (partial match)"),
                archived: z.boolean().optional().describe("Filter on archived status"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/activities"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_activity",
        {
            ...W,
            description: "Creates a new activity type for time tracking",
            inputSchema: z.object(activityFields),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/activities"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_activity",
        {
            ...R,
            description: "Returns a specific activity by ID",
            inputSchema: z.object({ activityId: z.number().int() }),
        },
        async ({ activityId }) => {
            try {
                return ok(await get(cp(`/activities/${activityId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_activity",
        {
            ...W,
            description: "Updates an activity (PATCH: only the supplied fields are changed)",
            inputSchema: z.object({
                activityId: z.number().int(),
                ...activityFields,
                name: activityFields.name.optional(),
            }),
        },
        async ({ activityId, ...body }) => {
            try {
                return ok(await mutate("PATCH", cp(`/activities/${activityId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_activity",
        {
            ...D,
            description: "Deletes an activity",
            inputSchema: z.object({ activityId: z.number().int() }),
        },
        async ({ activityId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/activities/${activityId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    // Time entries
    server.registerTool(
        "fiken_list_time_entries",
        {
            ...R,
            description: "Returns time entries for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                date: date("Exact date").optional(),
                dateGe: date("Date greater than or equal to").optional(),
                dateLe: date("Date less than or equal to").optional(),
                projectId: z.number().int().optional(),
                activityId: z.number().int().optional(),
                timeUserId: z.number().int().optional(),
                invoiced: z.boolean().optional().describe("Filter on invoiced status"),
                lastModifiedGe: z
                    .string()
                    .optional()
                    .describe("Modified at or after this ISO 8601 timestamp"),
                lastModifiedLe: z
                    .string()
                    .optional()
                    .describe("Modified at or before this ISO 8601 timestamp"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/timeEntries"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_time_entry",
        {
            ...W,
            description: "Creates a new time entry",
            inputSchema: z.object({
                ...timeEntryFields,
                timeUserId: z.number().int().describe("ID of the time user who performed the work"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/timeEntries"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_invoice_draft_from_time_entries",
        {
            ...W,
            description:
                "Creates an invoice draft from existing time entries. All time entries must be billable and not yet invoiced.",
            inputSchema: z.object({
                timeEntryIds: z.array(z.number().int()).describe("IDs of time entries to include"),
                customerId: z
                    .number()
                    .int()
                    .describe("Contact ID of the customer (contact must have customer=true)"),
                daysUntilDueDate: z
                    .number()
                    .int()
                    .describe("Number of days until the invoice is due"),
                groupBy: z
                    .enum(["activity", "activityAndPerson", "none"])
                    .optional()
                    .describe(
                        "How to group entries into invoice lines: activity = one line per activity, activityAndPerson = one line per activity and person, none = one line per entry",
                    ),
                includeTimeEntryDescriptions: z
                    .boolean()
                    .optional()
                    .describe("Include individual time entry descriptions in line descriptions"),
                issueDate: date("Issue date of the draft (defaults to today)").optional(),
                projectId: z
                    .number()
                    .int()
                    .optional()
                    .describe("Project to associate with the draft"),
                invoiceText: z
                    .string()
                    .optional()
                    .describe("Text displayed above the invoice lines"),
                yourReference: z.string().optional().describe("Customer's reference person"),
                ourReference: z.string().optional().describe("Your reference person"),
                orderReference: z.string().optional().describe("Order reference (used for EHF)"),
                currency: z.string().optional().describe("ISO 4217 currency code, default NOK"),
                bankAccountNumber: z
                    .string()
                    .optional()
                    .describe("Bank account number for payment"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/timeEntries/createInvoiceDraft"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_time_entry",
        {
            ...R,
            description: "Returns a specific time entry by ID",
            inputSchema: z.object({ timeEntryId: z.number().int() }),
        },
        async ({ timeEntryId }) => {
            try {
                return ok(await get(cp(`/timeEntries/${timeEntryId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_time_entry",
        {
            ...W,
            description: "Updates a time entry (PATCH: only the supplied fields are changed)",
            inputSchema: z.object({
                timeEntryId: z.number().int(),
                date: timeEntryFields.date.optional(),
                hours: timeEntryFields.hours.optional(),
                startTime: timeEntryFields.startTime,
                description: timeEntryFields.description,
                internalNote: timeEntryFields.internalNote,
                activityId: timeEntryFields.activityId.optional(),
                projectId: timeEntryFields.projectId,
            }),
        },
        async ({ timeEntryId, ...body }) => {
            try {
                return ok(await mutate("PATCH", cp(`/timeEntries/${timeEntryId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_time_entry",
        {
            ...D,
            description: "Deletes a time entry",
            inputSchema: z.object({ timeEntryId: z.number().int() }),
        },
        async ({ timeEntryId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/timeEntries/${timeEntryId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    // Time users
    server.registerTool(
        "fiken_list_time_users",
        {
            ...R,
            description: "Returns all time-tracking users for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                ...paging.shape,
                name: z.string().optional().describe("Filter by name (partial match)"),
                email: z.string().optional().describe("Filter by email address"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/timeUsers"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_time_user",
        {
            ...R,
            description: "Returns a specific time-tracking user by ID",
            inputSchema: z.object({ timeUserId: z.number().int() }),
        },
        async ({ timeUserId }) => {
            try {
                return ok(await get(cp(`/timeUsers/${timeUserId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}
