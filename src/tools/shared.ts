import { z } from "zod";

export const R = { annotations: { readOnlyHint: true } } as const;
export const W = { annotations: { readOnlyHint: false } } as const;
export const D = { annotations: { readOnlyHint: false, destructiveHint: true } } as const;

export function ok(data: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function err(e: unknown) {
    return {
        content: [
            { type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` },
        ],
        isError: true as const,
    };
}

export const PAGINATION_NOTE =
    " The result includes pagination (page, pageSize, pageCount, resultCount) when available: if page + 1 < pageCount, call again with page + 1 to fetch further pages.";

export const pageField = z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Page number, 0-based integer >= 0 (default 0)");

export const pageSizeField = z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page, integer 1-100 (default 25)");

/** Like ok(), but wraps the items with pagination info when the response carried it. */
export function okList({ data, pagination }: { data: unknown; pagination: unknown }) {
    return ok(pagination === undefined ? data : { items: data, pagination });
}
