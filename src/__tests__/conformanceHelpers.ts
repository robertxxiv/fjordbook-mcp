import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* OpenAPI spec parsing                                                */
/* ------------------------------------------------------------------ */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BodySpec {
    /** Top-level property names of the request schema */
    props: Set<string>;
    required: Set<string>;
}

export interface Operation {
    key: string;
    method: string;
    template: string;
    queryParams: Set<string>;
    pathParams: Set<string>;
    requiredQuery: Set<string>;
    /** Present when the operation declares a JSON request body */
    json?: BodySpec;
    /** Present when the operation declares a multipart request body */
    multipart?: BodySpec;
    hasBody: boolean;
    bodyRequired: boolean;
}

const METHODS = ["get", "post", "put", "patch", "delete"];

export function loadSpec(): Map<string, Operation> {
    const doc = parse(readFileSync(resolve(__dirname, "../../docs/fiken-openapi.yaml"), "utf8"));

    const deref = (node: Json | undefined): Json => {
        let cur = node ?? {};
        while (typeof cur.$ref === "string") {
            cur = cur.$ref
                .replace(/^#\//, "")
                .split("/")
                .reduce((acc: Json, part: string) => acc[part], doc);
        }
        return cur;
    };

    /** Flatten allOf and collect top-level properties + required names. */
    const collect = (schema: Json | undefined): BodySpec => {
        const s = deref(schema);
        const out: BodySpec = { props: new Set(), required: new Set() };
        for (const name of Object.keys(s.properties ?? {})) out.props.add(name);
        // The spec sometimes lists a required name without declaring it (e.g. purchaseRequest.paid).
        for (const name of s.required ?? []) {
            out.required.add(name);
            out.props.add(name);
        }
        for (const part of s.allOf ?? []) {
            const sub = collect(part);
            sub.props.forEach((p) => out.props.add(p));
            sub.required.forEach((p) => out.required.add(p));
        }
        return out;
    };

    const ops = new Map<string, Operation>();
    for (const [template, item] of Object.entries<Json>(doc.paths)) {
        for (const method of METHODS) {
            const op = item[method] as Json | undefined;
            if (!op) continue;
            const op_: Operation = {
                key: `${method.toUpperCase()} ${template}`,
                method: method.toUpperCase(),
                template,
                queryParams: new Set(),
                pathParams: new Set(),
                requiredQuery: new Set(),
                hasBody: false,
                bodyRequired: false,
            };
            for (const raw of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
                const p = deref(raw);
                if (p.in === "query") {
                    op_.queryParams.add(p.name);
                    if (p.required) op_.requiredQuery.add(p.name);
                } else if (p.in === "path") {
                    op_.pathParams.add(p.name);
                }
            }
            const content = deref(op.requestBody).content as Json | undefined;
            if (content) {
                op_.hasBody = true;
                op_.bodyRequired = Boolean(deref(op.requestBody).required);
                if (content["application/json"])
                    op_.json = collect(content["application/json"].schema);
                if (content["multipart/form-data"]) {
                    op_.multipart = collect(content["multipart/form-data"].schema);
                }
            }
            ops.set(op_.key, op_);
        }
    }
    return ops;
}

/**
 * Match a concrete request path (already stripped of /api/v2) against spec templates.
 * Templates with more literal segments win, so /invoices/drafts beats /invoices/{invoiceId}.
 */
export function matchOperation(
    spec: Map<string, Operation>,
    method: string,
    path: string,
): Operation | undefined {
    const segs = path.split("/");
    let best: { op: Operation; literals: number } | undefined;
    for (const op of spec.values()) {
        if (op.method !== method) continue;
        const tsegs = op.template.split("/");
        if (tsegs.length !== segs.length) continue;
        let literals = 0;
        const hit = tsegs.every((t, i) => {
            if (t.startsWith("{")) return segs[i] !== "";
            if (t === segs[i]) {
                literals++;
                return true;
            }
            return false;
        });
        if (hit && (!best || literals > best.literals)) best = { op, literals };
    }
    return best?.op;
}

/* ------------------------------------------------------------------ */
/* Sample input generation from zod (v3) schemas                       */
/* ------------------------------------------------------------------ */

export interface SampleContext {
    /** Path of a real (tiny) PDF file for filePath-style inputs */
    filePath: string;
    /** When set, id-like fields get distinct values (seq.n increments per field) */
    seq?: { n: number };
}

const isIdKey = (key: string) => /id$/i.test(key);

/** Distinct candidate for id-like fields so swapped path parameters are detectable. */
function uniqueId(key: string, ctx: SampleContext): string[] {
    return ctx.seq && isIdKey(key) ? [String(7000 + ++ctx.seq.n)] : [];
}

const STRING_CANDIDATES = [
    "sample",
    "2024-01-15",
    "a@example.com",
    "https://example.com",
    "123456789",
    "1234",
    "NOK",
    "NO",
];
const NUMBER_CANDIDATES = [1, 2, 10, 100, 1000, 10000, 0.5];

function stringHint(key: string, ctx: SampleContext): string[] {
    if (/filePath/i.test(key)) return [ctx.filePath];
    if (/uuid/i.test(key)) return ["3f2b8c1e-9d4a-4b6e-8a1f-2c7d5e9b0a13"];
    if (/base64/i.test(key)) return ["JVBERi0xLjQK"];
    if (/filename/i.test(key)) return ["test.pdf"];
    if (/date/i.test(key)) return ["2024-01-15"];
    if (/email/i.test(key)) return ["a@example.com"];
    return [];
}

export function sample(schema: z.ZodTypeAny, key: string, ctx: SampleContext): unknown {
    const def = schema._def as Json;
    switch (def.typeName) {
        case "ZodString": {
            for (const c of [
                ...stringHint(key, ctx),
                ...uniqueId(key, ctx),
                ...STRING_CANDIDATES,
            ]) {
                if (schema.safeParse(c).success) return c;
            }
            // pad to satisfy min-length style constraints
            const min = (def.checks as Json[]).find((c) => c.kind === "min")?.value ?? 1;
            return "x".repeat(min);
        }
        case "ZodNumber":
        case "ZodBigInt": {
            const unique = uniqueId(key, ctx).map(Number);
            for (const c of [...unique, ...NUMBER_CANDIDATES])
                if (schema.safeParse(c).success) return c;
            return 1;
        }
        case "ZodBoolean":
            return true;
        case "ZodEnum":
            return def.values[0];
        case "ZodNativeEnum":
            return Object.values(def.values)[0];
        case "ZodLiteral":
            return def.value;
        case "ZodNull":
            return null;
        case "ZodArray": {
            const n = Math.max(def.minLength?.value ?? 1, 1);
            return Array.from({ length: n }, () => sample(def.type, key, ctx));
        }
        case "ZodObject": {
            const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
            return Object.fromEntries(
                Object.entries(shape).map(([k, v]) => [k, sample(v, k, ctx)]),
            );
        }
        case "ZodRecord":
            return { key: sample(def.valueType, key, ctx) };
        case "ZodOptional":
        case "ZodNullable":
            return sample(def.innerType, key, ctx);
        case "ZodDefault":
            return sample(def.innerType, key, ctx);
        case "ZodEffects":
            return sample(def.schema, key, ctx);
        case "ZodUnion":
            return sample(def.options[0], key, ctx);
        case "ZodDiscriminatedUnion":
            return sample([...def.options.values()][0], key, ctx);
        case "ZodIntersection":
            return {
                ...(sample(def.left, key, ctx) as object),
                ...(sample(def.right, key, ctx) as object),
            };
        default:
            return "sample";
    }
}

/** Unwrap optional/default/nullable/effects so required-ness can be judged. */
export function isRequired(schema: z.ZodTypeAny): boolean {
    return !schema.isOptional();
}

/** Names of top-level string-typed fields of an object schema. */
export function stringFields(schema: z.ZodTypeAny): string[] {
    const unwrap = (s: z.ZodTypeAny): z.ZodTypeAny => {
        const def = s._def as Json;
        switch (def.typeName) {
            case "ZodOptional":
            case "ZodNullable":
            case "ZodDefault":
                return unwrap(def.innerType);
            case "ZodEffects":
                return unwrap(def.schema);
            default:
                return s;
        }
    };
    const shape = (unwrap(schema) as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
    return Object.entries(shape ?? {})
        .filter(([, v]) => (unwrap(v)._def as Json).typeName === "ZodString")
        .map(([k]) => k);
}
