import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, getWithMeta, mutate, cp } from "../client.js";
import { R, W, D, ok, okList, err, pageField, pageSizeField, PAGINATION_NOTE } from "./shared.js";

const date = (what: string) => z.string().optional().describe(`${what}, format YYYY-MM-DD`);

const productBody = {
    name: z.string().describe("Product name"),
    unitPrice: z.number().int().optional().describe("Net unit price in cents"),
    incomeAccount: z.string().describe('Income account that receives the payment, e.g. "3000"'),
    vatType: z
        .string()
        .describe(
            "One of HIGH, MEDIUM, LOW, EXEMPT, EXEMPT_IMPORT_EXPORT, EXEMPT_REVERSE, OUTSIDE, NONE. HIGH is the most common",
        ),
    active: z.boolean().describe("Whether the product is in use"),
    productNumber: z.string().optional().describe('Product number (varenummer), e.g. "125-1"'),
    stock: z
        .number()
        .optional()
        .describe("Number of products in stock (decimals allowed). If omitted, stock is null"),
    note: z.string().max(200).optional().describe("Additional information (max 200 characters)"),
};

const productId = z
    .number()
    .int()
    .describe("Product ID (the productId from the list call, not productNumber)");

export function register(server: McpServer) {
    server.registerTool(
        "fiken_list_products",
        {
            ...R,
            description: "Returns all products for the company" + PAGINATION_NOTE,
            inputSchema: z.object({
                page: pageField,
                pageSize: pageSizeField,
                createdDate: date("Created on exactly this date"),
                createdDateLe: date("Created on or before"),
                createdDateLt: date("Created before"),
                createdDateGe: date("Created on or after"),
                createdDateGt: date("Created after"),
                lastModified: date("Last modified on exactly this date"),
                lastModifiedLe: date("Last modified on or before"),
                lastModifiedLt: date("Last modified before"),
                lastModifiedGe: date("Last modified on or after"),
                lastModifiedGt: date("Last modified after"),
                name: z.string().optional().describe("Product name equal to this value"),
                productNumber: z.string().optional().describe("Product number equal to this value"),
                active: z.boolean().optional().describe("true for active, false for inactive"),
            }),
        },
        async (p) => {
            try {
                return okList(await getWithMeta(cp("/products"), p));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_create_product",
        {
            ...W,
            description:
                "Creates a new product. Amounts are in cents. Fiken enforces account/VAT combinations: incomeAccount must exist in the chart of accounts and match vatType (e.g. 3000 accepts only HIGH, 3100 only EXEMPT, 3200 only OUTSIDE).",
            inputSchema: z.object(productBody),
        },
        async (body) => {
            try {
                return ok(await mutate("POST", cp("/products"), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_get_product",
        {
            ...R,
            description: "Returns a specific product by ID",
            inputSchema: z.object({ productId }),
        },
        async ({ productId }) => {
            try {
                return ok(await get(cp(`/products/${productId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_update_product",
        {
            ...W,
            description: "Updates an existing product (full replacement; send all fields)",
            inputSchema: z.object({ productId, ...productBody }),
        },
        async ({ productId, ...body }) => {
            try {
                return ok(await mutate("PUT", cp(`/products/${productId}`), body));
            } catch (e) {
                return err(e);
            }
        },
    );

    server.registerTool(
        "fiken_delete_product",
        {
            ...D,
            description: "Deletes a product",
            inputSchema: z.object({ productId }),
        },
        async ({ productId }) => {
            try {
                return ok(await mutate("DELETE", cp(`/products/${productId}`)));
            } catch (e) {
                return err(e);
            }
        },
    );
}
