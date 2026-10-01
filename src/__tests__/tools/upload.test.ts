import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { z } from "zod";
import { loadUpload, exactlyOneSource, parseInput } from "../../tools/upload.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF = Buffer.from("GIF89a..");
const PDF = Buffer.from("%PDF-1.4\n");

let dir: string;
beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "fiken-upload-"));
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});
afterEach(() => {
    delete process.env.FIKEN_UPLOAD_ROOT;
    delete process.env.FIKEN_MAX_UPLOAD_BYTES;
});

async function file(name: string, data: Buffer | string) {
    const p = join(dir, name);
    await writeFile(p, data);
    return p;
}

describe("loadUpload filePath", () => {
    it.each([
        ["a.pdf", PDF, "application/pdf"],
        ["a.png", PNG, "image/png"],
        ["a.JPG", JPG, "image/jpeg"],
        ["a.jpeg", JPG, "image/jpeg"],
        ["a.gif", GIF, "image/gif"],
    ])("accepts %s and sets the blob type", async (name, data, type) => {
        const { filename, blob } = await loadUpload({ filePath: await file(name, data) });
        expect(filename).toBe(name);
        expect(blob.type).toBe(type);
        expect(blob.size).toBe(data.length);
    });

    it("uses an explicit filename", async () => {
        const r = await loadUpload({ filePath: await file("raw.bin", PDF), filename: "x.pdf" });
        expect(r.filename).toBe("x.pdf");
    });

    it("rejects content that does not match the extension", async () => {
        const p = await file("fake.pdf", "just text");
        await expect(loadUpload({ filePath: p })).rejects.toThrow(
            "File content does not match the .pdf extension",
        );
    });

    it("rejects unsupported extensions", async () => {
        await expect(loadUpload({ filePath: await file("a.txt", PDF) })).rejects.toThrow(
            "filename must end with",
        );
    });

    it("never includes file content in errors", async () => {
        const p = await file("secret.pdf", "TOPSECRET");
        await expect(loadUpload({ filePath: p })).rejects.not.toThrow(/TOPSECRET/);
    });

    it("rejects missing files", async () => {
        await expect(loadUpload({ filePath: join(dir, "nope.pdf") })).rejects.toThrow(
            "does not exist",
        );
    });

    it("rejects directories", async () => {
        const d = join(dir, "adir.pdf");
        await mkdir(d);
        await expect(loadUpload({ filePath: d })).rejects.toThrow("regular file");
    });

    it("rejects FIFOs without opening them", async () => {
        const p = join(dir, "fifo.pdf");
        execFileSync("mkfifo", [p]);
        await expect(loadUpload({ filePath: p })).rejects.toThrow("regular file");
    });

    it("resolves symlinks before checking the path", async () => {
        const hidden = join(dir, ".hidden");
        await mkdir(hidden, { recursive: true });
        const target = join(hidden, "t.pdf");
        await writeFile(target, PDF);
        const link = join(dir, "link.pdf");
        await symlink(target, link);
        await expect(loadUpload({ filePath: link })).rejects.toThrow("hidden");
    });

    it("rejects dot directories and dotfiles", async () => {
        const d = join(dir, ".ssh");
        await mkdir(d, { recursive: true });
        const p = join(d, "id.pdf");
        await writeFile(p, PDF);
        await expect(loadUpload({ filePath: p })).rejects.toThrow("hidden");
        await expect(loadUpload({ filePath: await file(".dot.pdf", PDF) })).rejects.toThrow(
            "hidden",
        );
    });

    it.each(["/etc/hostname", "/proc/self/cmdline"])("rejects system path %s", async (p) => {
        // Rejected by the extension check first, so use a filename override.
        await expect(loadUpload({ filePath: p, filename: "x.pdf" })).rejects.toThrow(
            "restricted system directory",
        );
    });

    it("rejects files over FIKEN_MAX_UPLOAD_BYTES before reading", async () => {
        process.env.FIKEN_MAX_UPLOAD_BYTES = "5";
        await expect(loadUpload({ filePath: await file("big.pdf", PDF) })).rejects.toThrow(
            "upload limit",
        );
    });

    it("ignores an invalid FIKEN_MAX_UPLOAD_BYTES", async () => {
        process.env.FIKEN_MAX_UPLOAD_BYTES = "abc";
        const r = await loadUpload({ filePath: await file("ok.pdf", PDF) });
        expect(r.blob.size).toBe(PDF.length);
    });

    it("enforces FIKEN_UPLOAD_ROOT", async () => {
        const inside = join(dir, "root-in");
        await mkdir(inside);
        const p = join(inside, "a.pdf");
        await writeFile(p, PDF);
        process.env.FIKEN_UPLOAD_ROOT = inside;
        await expect(loadUpload({ filePath: p })).resolves.toBeDefined();
        await expect(loadUpload({ filePath: await file("out.pdf", PDF) })).rejects.toThrow(
            "outside FIKEN_UPLOAD_ROOT",
        );
    });

    it("allows dot directories when they are inside FIKEN_UPLOAD_ROOT", async () => {
        const d = join(dir, ".allowed");
        await mkdir(d, { recursive: true });
        const p = join(d, "a.pdf");
        await writeFile(p, PDF);
        process.env.FIKEN_UPLOAD_ROOT = d;
        await expect(loadUpload({ filePath: p })).resolves.toBeDefined();
    });

    it("rejects a missing FIKEN_UPLOAD_ROOT", async () => {
        process.env.FIKEN_UPLOAD_ROOT = join(dir, "no-such-root");
        await expect(loadUpload({ filePath: await file("r.pdf", PDF) })).rejects.toThrow(
            "FIKEN_UPLOAD_ROOT does not exist",
        );
    });
});

describe("loadUpload base64", () => {
    const b64 = (b: Buffer) => b.toString("base64");

    it("decodes valid base64, tolerating whitespace", async () => {
        const data = b64(PDF).replace(/(.{4})/g, "$1\n");
        const r = await loadUpload({ fileBase64: data, filename: "a.pdf" });
        expect(r.blob.size).toBe(PDF.length);
    });

    it("rejects invalid base64", async () => {
        await expect(loadUpload({ fileBase64: "not base64!", filename: "a.pdf" })).rejects.toThrow(
            "not valid base64",
        );
    });

    it("rejects whitespace-only input", async () => {
        await expect(loadUpload({ fileBase64: "   ", filename: "a.pdf" })).rejects.toThrow(
            "not valid base64",
        );
    });

    it("rejects content that does not match the extension", async () => {
        await expect(
            loadUpload({ fileBase64: b64(Buffer.from("hello")), filename: "a.png" }),
        ).rejects.toThrow("does not match the .png extension");
    });

    it("enforces the size cap on the encoded input", async () => {
        process.env.FIKEN_MAX_UPLOAD_BYTES = "3";
        await expect(loadUpload({ fileBase64: b64(PDF), filename: "a.pdf" })).rejects.toThrow(
            "upload limit",
        );
    });

    it("accounts for padding in the size cap", async () => {
        process.env.FIKEN_MAX_UPLOAD_BYTES = "4";
        // "%PDF" is 4 bytes = "JVBERg==" (2 padding chars) and must pass
        await expect(
            loadUpload({ fileBase64: "JVBERg==", filename: "a.pdf" }),
        ).resolves.toBeDefined();
        // 3 raw bytes plus one padding char
        expect(Buffer.from("JVBE", "base64").length).toBe(3);
        await expect(
            loadUpload({ fileBase64: b64(Buffer.from("%PDF-")), filename: "a.pdf" }),
        ).rejects.toThrow("upload limit");
        await expect(
            loadUpload({ fileBase64: b64(Buffer.from("%PDF--")), filename: "a.pdf" }),
        ).rejects.toThrow("upload limit");
    });

    it("rejects an empty decoded payload", async () => {
        await expect(loadUpload({ fileBase64: "A", filename: "a.pdf" })).rejects.toThrow(
            "empty file",
        );
    });

    it("requires a filename", async () => {
        await expect(loadUpload({ fileBase64: b64(PDF) })).rejects.toThrow("filename is required");
    });
});

describe("loadUpload sources", () => {
    it("requires exactly one of filePath/fileBase64", async () => {
        await expect(loadUpload({})).rejects.toThrow("Either filePath or fileBase64");
        await expect(loadUpload({ filePath: "/x", fileBase64: "eA==" })).rejects.toThrow(
            "only one of",
        );
    });
});

describe("exactlyOneSource", () => {
    const schema = (docs: boolean) =>
        z
            .object({
                filePath: z.string().optional(),
                fileBase64: z.string().optional(),
                filename: z.string().optional(),
                ehfDocumentId: z.number().optional(),
                inboxDocumentId: z.number().optional(),
            })
            .superRefine(exactlyOneSource(docs));

    it("accepts a single source and rejects none or several", () => {
        expect(schema(true).safeParse({ ehfDocumentId: 1 }).success).toBe(true);
        expect(schema(true).safeParse({}).success).toBe(false);
        expect(schema(true).safeParse({ filePath: "/a", inboxDocumentId: 1 }).success).toBe(false);
        expect(schema(true).safeParse({ filePath: "", ehfDocumentId: 1 }).success).toBe(true);
    });

    it("ignores document ids when not allowed", () => {
        const r = schema(false).safeParse({ ehfDocumentId: 1 });
        expect(r.success).toBe(false);
        expect(schema(false).safeParse({ filePath: "/a", ehfDocumentId: 1 }).success).toBe(true);
    });

    it("requires filename with fileBase64", () => {
        expect(schema(false).safeParse({ fileBase64: "eA==" }).success).toBe(false);
        expect(schema(false).safeParse({ fileBase64: "eA==", filename: "a.pdf" }).success).toBe(
            true,
        );
    });
});

describe("parseInput", () => {
    it("returns data or throws a readable Error", () => {
        const s = z.object({ a: z.number() });
        expect(parseInput(s, { a: 1 })).toEqual({ a: 1 });
        expect(() => parseInput(s, { a: "x" })).toThrow(Error);
    });
});
