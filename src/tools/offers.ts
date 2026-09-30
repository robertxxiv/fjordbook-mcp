import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, mutate, cp } from "../client.js";
import { R, W, D, ok, err } from "./shared.js";
import { draftSchema, sendSchema } from "./orderConfirmations.js";

const pagination = {
    page: z.number().int().optional().describe("Page number, starting at 0"),
    pageSize: z.number().int().optional().describe("Results per page (max 100)"),
};

const draftId = z.number().int().describe("Draft ID");

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_offers",
        {
            ...R,
            description: "Returns all offers for the company",
            inputSchema: z.object(pagination),
        },
        async (p) => {
            try {
                return ok(await get(cp("/offers"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_offer",
        {
            ...R,
            description: "Returns a specific offer by ID",
            inputSchema: z.object({ offerId: z.string().describe("Offer ID") }),
        },
        async ({ offerId }) => {
            try {
                return ok(await get(cp(`/offers/${offerId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_offer_counter",
        {
            ...R,
            description: "Retrieves the current offer number counter",
            inputSchema: z.object({}),
        },
        async () => {
            try {
                return ok(await get(cp("/offers/counter")));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_offer_counter",
        {
            ...W,
            description: "Creates the first offer number counter",
            inputSchema: z.object({
                value: z.number().int().optional().describe("Current value of the counter"),
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/offers/counter"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_list_offer_drafts",
        {
            ...R,
            description: "Returns all offer drafts for the company",
            inputSchema: z.object(pagination),
        },
        async (p) => {
            try {
                return ok(await get(cp("/offers/drafts"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_offer_draft",
        {
            ...W,
            description: "Creates a new offer draft",
            inputSchema: draftSchema,
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/offers/drafts"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_offer_draft",
        {
            ...R,
            description: "Returns a specific offer draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/offers/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_offer_draft",
        {
            ...W,
            description: "Updates an offer draft",
            inputSchema: z.object({ draftId, ...draftSchema.shape }),
        },
        async ({ draftId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/offers/drafts/${draftId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_offer_draft",
        {
            ...D,
            description: "Deletes an offer draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/offers/drafts/${draftId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_offer_draft_attachments",
        {
            ...R,
            description: "Returns all attachments for an offer draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await get(cp(`/offers/drafts/${draftId}/attachments`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_offer_from_draft",
        {
            ...W,
            description: "Creates a finalized offer from a draft",
            inputSchema: z.object({ draftId }),
        },
        async ({ draftId }) => {
            try {
                return ok(await mutate("POST", cp(`/offers/drafts/${draftId}/createOffer`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_send_offer",
        {
            ...W,
            description: "Sends an offer by email, EHF, eFaktura, SMS or letter",
            inputSchema: z.object({
                offerId: z.number().int().describe("ID of the offer to send"),
                ...sendSchema.shape,
            }),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/offers/send"), body));
            } catch (e) {
                return err(e);
            }
        },
    );
}
