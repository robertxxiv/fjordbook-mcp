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
