import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, cp } from "../client.js";
import { R, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

export function register(server: McpServer) {
    server.registerTool(
        "fiken_get_user",
        {
            ...R,
            description: "Returns information about the authenticated Fiken user",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get("/user"));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_companies",
        {
            ...R,
            description:
                "Returns all companies the authenticated user has access to" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                sortBy: z
                    .enum([
                        "createdDate asc",
                        "createdDate desc",
                        "name asc",
                        "name desc",
                        "organizationNumber asc",
                        "organizationNumber desc",
                    ])
                    .optional()
                    .describe("Sort order (default name asc)"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta("/companies", p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_company",
        {
            ...R,
            description: "Returns details of the company configured via FIKEN_COMPANY_SLUG",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get(cp("")));
            } catch (e) {
                return err(e);
            }
        },
    );
}
