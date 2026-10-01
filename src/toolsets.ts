import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerUser } from "./tools/user.js";
import { register as registerAccounts } from "./tools/accounts.js";
import { register as registerContacts } from "./tools/contacts.js";
import { register as registerInvoices } from "./tools/invoices.js";
import { register as registerCreditNotes } from "./tools/creditNotes.js";
import { register as registerOffers } from "./tools/offers.js";
import { register as registerOrderConfirmations } from "./tools/orderConfirmations.js";
import { register as registerJournalEntries } from "./tools/journalEntries.js";
import { register as registerTransactions } from "./tools/transactions.js";
import { register as registerPurchases } from "./tools/purchases.js";
import { register as registerSales } from "./tools/sales.js";
import { register as registerMisc } from "./tools/misc.js";
import { register as registerRecurringInvoices } from "./tools/recurringInvoices.js";
import { register as registerProducts } from "./tools/products.js";
import { register as registerTimeTracking } from "./tools/timeTracking.js";
import { register as registerAttachments } from "./tools/attachments.js";

export const TOOLSETS: Record<string, (server: McpServer) => void> = {
    user: registerUser,
    accounts: registerAccounts,
    contacts: registerContacts,
    invoices: registerInvoices,
    creditNotes: registerCreditNotes,
    offers: registerOffers,
    orderConfirmations: registerOrderConfirmations,
    journalEntries: registerJournalEntries,
    transactions: registerTransactions,
    purchases: registerPurchases,
    sales: registerSales,
    misc: registerMisc,
    recurringInvoices: registerRecurringInvoices,
    products: registerProducts,
    timeTracking: registerTimeTracking,
    attachments: registerAttachments,
};

/** The user toolset is always registered: it is how a client discovers the company. */
const ALWAYS_ON = "user";

/**
 * Resolves the FIKEN_TOOLSETS value (comma-separated toolset names, default all) to the list of
 * toolsets to register. Throws on unknown names so a typo cannot silently hide tools.
 */
export function selectToolsets(value: string | undefined): string[] {
    const all = Object.keys(TOOLSETS);
    const requested = (value ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
    if (requested.length === 0) return all;
    const unknown = requested.filter((n) => !(n in TOOLSETS));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown FIKEN_TOOLSETS value(s): ${unknown.join(", ")}. Valid toolsets: ${all.join(", ")}`,
        );
    }
    return all.filter((n) => n === ALWAYS_ON || requested.includes(n));
}
