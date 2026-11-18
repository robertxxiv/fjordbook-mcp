import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DRAFT_WRITE =
    /^fiken_(create|update)_(invoice|credit_note|purchase|sale|offer|order_confirmation)_draft$/;
const DRAFT_ATTACHMENT =
    /^fiken_add_(invoice|credit_note|purchase|sale|offer|order_confirmation)_draft_attachment$/;
const READ = /^fiken_(list|get)_/;

export function draftOnlyEnabled(value: string | undefined): boolean {
    if (value === undefined || value === "" || value === "true") return true;
    if (value === "false") return false;
    throw new Error("FIKEN_DRAFT_ONLY must be 'true' or 'false'");
}

/** Expose only reads and explicitly approved draft writes to the MCP client. */
export function draftOnlyServer(server: McpServer): McpServer {
    return new Proxy(server, {
        get(target, property, receiver) {
            if (property !== "registerTool") return Reflect.get(target, property, receiver);
            return (
                name: string,
                config: { annotations?: { readOnlyHint?: boolean } },
                ...rest: unknown[]
            ) => {
                if (
                    (READ.test(name) && config.annotations?.readOnlyHint === true) ||
                    DRAFT_WRITE.test(name) ||
                    DRAFT_ATTACHMENT.test(name)
                ) {
                    return (target.registerTool as (...args: unknown[]) => unknown)(
                        name,
                        config,
                        ...rest,
                    );
                }
                return undefined;
            };
        },
    });
}
