import { describe, expect, it } from "vitest";
import { dateField } from "../../tools/shared.js";

describe("dateField", () => {
    const f = dateField("Issue date");
    it("accepts YYYY-MM-DD", () => {
        expect(f.safeParse("2026-10-01").success).toBe(true);
        expect(f.safeParse("2024-02-29").success).toBe(true);
    });
    it("rejects other formats and impossible dates", () => {
        expect(f.safeParse("01.10.2026").success).toBe(false);
        expect(f.safeParse("2026-02-30").success).toBe(false);
        expect(f.safeParse("2026-13-01").success).toBe(false);
        expect(f.safeParse("2026-10-01T00:00:00Z").success).toBe(false);
    });
    it("defaults the description and stays optional-able", () => {
        expect(dateField().description).toBe("Date, format YYYY-MM-DD");
        expect(dateField().optional().safeParse(undefined).success).toBe(true);
    });
});
