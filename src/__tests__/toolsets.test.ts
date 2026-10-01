import { describe, it, expect } from "vitest";
import { TOOLSETS, selectToolsets } from "../toolsets.js";

describe("selectToolsets", () => {
    const all = Object.keys(TOOLSETS);

    it("returns all 16 toolsets by default", () => {
        expect(all).toHaveLength(16);
        expect(selectToolsets(undefined)).toEqual(all);
        expect(selectToolsets("")).toEqual(all);
        expect(selectToolsets(" , ")).toEqual(all);
    });

    it("returns only the requested toolsets plus user, in canonical order", () => {
        expect(selectToolsets("sales, contacts")).toEqual(["user", "contacts", "sales"]);
    });

    it("does not duplicate user when requested explicitly", () => {
        expect(selectToolsets("user,products")).toEqual(["user", "products"]);
    });

    it("throws a clear error listing valid names for unknown toolsets", () => {
        expect(() => selectToolsets("sales,nope")).toThrow(
            /Unknown FIKEN_TOOLSETS.*nope.*Valid toolsets: user,/,
        );
    });
});
