import { realpath, stat, readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import { z } from "zod";

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DENIED_PREFIXES = ["/etc", "/proc", "/sys", "/dev", "/root"];

export const SUPPORTED_EXTENSIONS_TEXT = ".png, .jpeg, .jpg, .gif or .pdf";

export const UPLOAD_ENV_NOTE =
    "Local files are restricted: they must be regular files no larger than FIKEN_MAX_UPLOAD_BYTES (default 25 MiB), " +
    "inside FIKEN_UPLOAD_ROOT when that is set (otherwise dot-directories such as .ssh and system paths such as /etc are refused), " +
    "and their content must match the file extension.";

const MIME_TYPES: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
};

const MAGIC: Record<string, (b: Buffer) => boolean> = {
    pdf: (b) => b.subarray(0, 4).toString("latin1") === "%PDF",
    png: (b) =>
        b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    gif: (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")),
};
MAGIC.jpeg = MAGIC.jpg;

function maxUploadBytes(): number {
    const n = Number(process.env.FIKEN_MAX_UPLOAD_BYTES);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_UPLOAD_BYTES;
}

function extensionOf(filename: string): string {
    const m = /\.(png|jpe?g|gif|pdf)$/i.exec(filename);
    if (!m) throw new Error(`filename must end with ${SUPPORTED_EXTENSIONS_TEXT}`);
    return m[1].toLowerCase();
}

function isInside(root: string, target: string): boolean {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function assertPathAllowed(real: string) {
    const root = process.env.FIKEN_UPLOAD_ROOT;
    if (root) {
        let realRoot: string;
        try {
            realRoot = await realpath(root);
        } catch {
            throw new Error("FIKEN_UPLOAD_ROOT does not exist");
        }
        if (!isInside(realRoot, real)) {
            throw new Error("filePath is outside FIKEN_UPLOAD_ROOT");
        }
        return;
    }
    if (real.split(sep).some((s) => s.startsWith("."))) {
        throw new Error(
            "filePath is inside a hidden (dot) directory or is a dotfile; set FIKEN_UPLOAD_ROOT to allow a specific directory",
        );
    }
    if (DENIED_PREFIXES.some((p) => real === p || real.startsWith(p + "/"))) {
        throw new Error("filePath is in a restricted system directory");
    }
}

async function readLocalFile(filePath: string): Promise<Buffer> {
    let real: string;
    try {
        real = await realpath(filePath);
    } catch {
        throw new Error("filePath does not exist or cannot be resolved");
    }
    await assertPathAllowed(real);
    const info = await stat(real);
    if (!info.isFile()) throw new Error("filePath must be a regular file");
    const max = maxUploadBytes();
    if (info.size > max) {
        throw new Error(`File is ${info.size} bytes, larger than the ${max} byte upload limit`);
    }
    return readFile(real);
}

function decodeBase64(data: string): Buffer {
    const clean = data.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
        throw new Error("fileBase64 is not valid base64");
    }
    const max = maxUploadBytes();
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    if (Math.floor((clean.length * 3) / 4) - padding > max) {
        throw new Error(`fileBase64 decodes to more than the ${max} byte upload limit`);
    }
    const bytes = Buffer.from(clean, "base64");
    if (bytes.length === 0) throw new Error("fileBase64 decodes to an empty file");
    return bytes;
}

export type UploadSource = {
    filePath?: string;
    fileBase64?: string;
    filename?: string;
};

/**
 * Validates and loads a file for upload from either a local path or base64 data.
 * Returns the filename to send and a Blob with the MIME type set from the extension.
 */
export async function loadUpload(src: UploadSource): Promise<{ filename: string; blob: Blob }> {
    const { filePath, fileBase64 } = src;
    if (filePath && fileBase64) throw new Error("Provide only one of filePath or fileBase64");
    if (!filePath && !fileBase64) throw new Error("Either filePath or fileBase64 is required");
    if (fileBase64 && !src.filename) {
        throw new Error("filename is required when using fileBase64");
    }
    const filename = src.filename ?? basename(filePath!);
    const ext = extensionOf(filename);
    const bytes = fileBase64 ? decodeBase64(fileBase64) : await readLocalFile(filePath!);
    if (!MAGIC[ext](bytes)) {
        throw new Error(`File content does not match the .${ext} extension`);
    }
    return { filename, blob: new Blob([new Uint8Array(bytes)], { type: MIME_TYPES[ext] }) };
}

type SourceFields = {
    filePath?: string;
    fileBase64?: string;
    ehfDocumentId?: number;
    inboxDocumentId?: number;
};

/**
 * Shared superRefine: exactly one source of filePath | fileBase64 | ehfDocumentId | inboxDocumentId
 * (the document ids only when the operation allows them), and filename with fileBase64.
 */
export function exactlyOneSource(documentIds: boolean) {
    const names = documentIds
        ? "filePath, fileBase64, ehfDocumentId or inboxDocumentId"
        : "filePath or fileBase64";
    return (value: SourceFields & { filename?: string }, ctx: z.RefinementCtx) => {
        const sources = [
            value.filePath,
            value.fileBase64,
            ...(documentIds ? [value.ehfDocumentId, value.inboxDocumentId] : []),
        ].filter((s) => s !== undefined && s !== "").length;
        if (sources !== 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Provide exactly one of ${names}`,
            });
        }
        if (value.fileBase64 && !value.filename) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "filename is required when using fileBase64",
            });
        }
    };
}

/** Parses tool input and throws a readable Error (issue messages only) on failure. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
    const result = schema.safeParse(raw);
    if (!result.success) {
        throw new Error(result.error.issues.map((i) => i.message).join("; "));
    }
    return result.data;
}

/**
 * Pairs the plain object schema (advertised via tools/list, because the MCP SDK cannot derive a
 * JSON schema from a refined ZodEffects) with the refined schema used for runtime validation.
 */
export function refinedInput<T extends z.ZodRawShape>(
    object: z.ZodObject<T>,
    refine: (value: z.output<z.ZodObject<T>>, ctx: z.RefinementCtx) => void,
) {
    return { input: object, validated: object.superRefine(refine) };
}
