import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import {
    R,
    W,
    D,
    ok,
    okList,
    err,
    pageField,
    pageSizeField,
    PAGINATION_NOTE,
    dateField,
} from "./shared.js";
import { draftLine, frequency } from "./invoices.js";

const recurringInvoiceId = z
    .number()
    .int()
    .describe("Recurring invoice ID (from fiken_list_recurring_invoices)");
const jobId = z
    .number()
    .int()
    .describe("Job ID: a single customer's recurrence within the recurring invoice");
const ymd = (what: string) => dateField(what);
const roundingType = z
    .enum(["none", "round_half", "round_whole", "round_down_half", "round_down_whole"])
    .optional()
    .describe(
        "Øre rounding of the total (NOK only): none (default), round_half, round_whole, round_down_half, round_down_whole",
    );

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_recurring_invoices",
        {
            ...R,
            description: "Returns all recurring invoices for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                customerId: z
                    .number()
                    .int()
                    .optional()
                    .describe("Only recurring invoices with a job for this customer (contactId)"),
                active: z
                    .boolean()
                    .optional()
                    .describe("true: at least one active job; false: no active job"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/recurringInvoices"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_recurring_invoice",
        {
            ...W,
            description:
                'Creates a recurring invoice ("Repeterende faktura") for a single customer. Amounts are in cents. The recurring invoice number series must already exist (create the first one in Fiken Web).',
            inputSchema: z.object({
                uuid: z.string().optional().describe("Optional UUID; generated if omitted"),
                customerId: z.number().int().describe("Contact ID of the customer"),
                contactPersonId: z
                    .number()
                    .int()
                    .optional()
                    .describe("Contact person; must belong to the customer"),
                startDate: ymd("First issue date"),
                endDate: ymd("Optional date after which no more invoices are generated").optional(),
                daysUntilDueDate: z
                    .number()
                    .int()
                    .describe("Days until due date for each generated invoice"),
                frequency,
                currency: z
                    .string()
                    .regex(/^[A-Z]{3}$/)
                    .optional()
                    .describe('ISO 4217, e.g. "NOK" (default NOK)'),
                bankAccountNumber: z.string().describe('Bank account number, e.g. "11112233334"'),
                iban: z.string().optional(),
                bic: z.string().optional(),
                invoiceText: z.string().optional().describe("Text printed above the lines"),
                yourReference: z.string().optional(),
                ourReference: z.string().optional(),
                orderReference: z.string().optional().describe("Reference if sending via EHF"),
                lines: z.array(draftLine).min(1).describe("Invoice lines (at least one)"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/recurringInvoices"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_recurring_invoice",
        {
            ...R,
            description: "Returns a specific recurring invoice by ID",
            inputSchema: z.object({ recurringInvoiceId }),
        },
        async ({ recurringInvoiceId }) => {
            try {
                return ok(await get(cp(`/recurringInvoices/${recurringInvoiceId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_recurring_invoice_lines",
        {
            ...W,
            description:
                "Replaces all invoice lines of a recurring invoice (applies to every job). Amounts are in cents.",
            inputSchema: z.object({
                recurringInvoiceId,
                lines: z.array(draftLine).min(1).describe("New invoice lines (at least one)"),
                roundingType,
            }),
        },
        async ({ recurringInvoiceId, ...body }) => {
            try {
                return ok(
                    await mutate("PUT", cp(`/recurringInvoices/${recurringInvoiceId}/lines`), body),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_recurring_invoice_frequency",
        {
            ...W,
            description:
                "Updates description, frequency and days-until-due of a recurring invoice (applies to every job)",
            inputSchema: z.object({
                recurringInvoiceId,
                description: z.string().max(250).optional().describe("Description (max 250 chars)"),
                frequency,
                daysUntilDueDate: z.number().int().describe("Days until due date"),
            }),
        },
        async ({ recurringInvoiceId, ...body }) => {
            try {
                return ok(
                    await mutate(
                        "PUT",
                        cp(`/recurringInvoices/${recurringInvoiceId}/frequency`),
                        body,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_add_recurring_invoice_job",
        {
            ...W,
            description:
                "Adds a job (an additional customer) to a recurring invoice. Lines and settings are copied from an existing job. A customer can appear only once.",
            inputSchema: z.object({
                recurringInvoiceId,
                customerId: z
                    .number()
                    .int()
                    .describe("Contact ID of the customer; must not already be on the invoice"),
                contactPersonIds: z
                    .array(z.number().int())
                    .optional()
                    .describe(
                        "Contact persons to send to; each must belong to the customer and have an email. If omitted, derived from the customer (EHF if registered, else email)",
                    ),
                nextDate: ymd(
                    "First issue date of the new job (default: next date of existing job)",
                ).optional(),
            }),
        },
        async ({ recurringInvoiceId, ...body }) => {
            try {
                return ok(
                    await mutate("POST", cp(`/recurringInvoices/${recurringInvoiceId}/jobs`), body),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_recurring_invoice_job_schedule",
        {
            ...W,
            description: "Updates the next date and/or end date of a single job",
            inputSchema: z.object({
                recurringInvoiceId,
                jobId,
                nextDate: ymd("New next date; omit to leave unchanged").optional(),
                endDate: ymd("End date; omit to clear the end date").optional(),
            }),
        },
        async ({ recurringInvoiceId, jobId, ...body }) => {
            try {
                return ok(
                    await mutate(
                        "PUT",
                        cp(`/recurringInvoices/${recurringInvoiceId}/jobs/${jobId}/schedule`),
                        body,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_recurring_invoice_job_recipients",
        {
            ...W,
            description:
                "Replaces the delivery configuration of a job. Any channel not included is turned off; at least one recipient is required. EHF, eFaktura and SMS are mutually exclusive.",
            inputSchema: z.object({
                recurringInvoiceId,
                jobId,
                emails: z
                    .array(z.string())
                    .optional()
                    .describe("Ad-hoc email addresses not belonging to a contact person"),
                contactPersonIds: z
                    .array(z.number().int())
                    .optional()
                    .describe("Contact persons of the job's customer (must have an email)"),
                ehf: z
                    .boolean()
                    .optional()
                    .describe("Send as EHF (needs customer organization number)"),
                efaktura: z
                    .boolean()
                    .optional()
                    .describe("Send as eFaktura (needs approved eFaktura agreement)"),
                letter: z.boolean().optional().describe("Send as letter to the registered address"),
                smsPhoneNumber: z
                    .string()
                    .nullable()
                    .optional()
                    .describe("Phone number to notify by SMS; omit or null for no SMS"),
            }),
        },
        async ({ recurringInvoiceId, jobId, ...body }) => {
            try {
                return ok(
                    await mutate(
                        "PUT",
                        cp(`/recurringInvoices/${recurringInvoiceId}/jobs/${jobId}/recipients`),
                        body,
                    ),
                );
            } catch (e) {
                return err(e);
            }
        },
    );

    const jobActions = [
        ["pause", W, "Pauses a job so no invoices are generated until it is resumed"],
        ["resume", W, "Resumes a previously paused job"],
        [
            "stop",
            D,
            "Stops a job permanently. If it has generated no invoices and the recurring invoice has more than one job it is deleted; otherwise it is deactivated and its end date set",
        ],
    ] as const;
    for (const [action, annotations, description] of jobActions) {
        server.registerTool(
            `fiken_${action}_recurring_invoice_job`,
            {
                ...annotations,
                description,
                inputSchema: z.object({ recurringInvoiceId, jobId }),
            },
            async ({ recurringInvoiceId, jobId }) => {
                try {
                    return ok(
                        await mutate(
                            "POST",
                            cp(`/recurringInvoices/${recurringInvoiceId}/jobs/${jobId}/${action}`),
                        ),
                    );
                } catch (e) {
                    return err(e);
                }
            },
        );
    }
}
