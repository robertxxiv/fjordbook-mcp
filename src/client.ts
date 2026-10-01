const BASE = "https://api.fiken.no/api/v2";

function token(): string {
    const t = process.env.FIKEN_API_TOKEN;
    if (!t) throw new Error("FIKEN_API_TOKEN environment variable is required");
    return t;
}

export function slug(): string {
    const s = process.env.FIKEN_COMPANY_SLUG;
    if (!s) throw new Error("FIKEN_COMPANY_SLUG environment variable is required");
    return s;
}

/** Build a company-scoped path, e.g. cp('/invoices') → /companies/my-slug/invoices */
export function cp(path: string): string {
    return `/companies/${slug()}${path}`;
}

type Params = Record<string, string | number | boolean | undefined | null>;

const BASE_URL = new URL(BASE);

/** Percent-decode until stable (bounded), keeping the raw text if it is malformed. */
function safeDecode(seg: string): string {
    let cur = seg;
    for (let i = 0; i < 3; i++) {
        let next: string;
        try {
            next = decodeURIComponent(cur);
        } catch {
            return cur;
        }
        if (next === cur) break;
        cur = next;
    }
    return cur;
}

/** Reject path segments that could escape the intended endpoint (dot-segments, slashes, ...). */
function assertSafePath(path: string): void {
    for (const raw of path.split("?")[0].split("/")) {
        const seg = safeDecode(raw);
        // eslint-disable-next-line no-control-regex
        if (seg === "." || seg === ".." || /[\\/\u0000-\u001f\u007f]/.test(seg)) {
            throw new Error(`Invalid path segment ${JSON.stringify(raw)} in ${path}`);
        }
    }
}

function buildUrl(path: string, params?: Params): URL {
    assertSafePath(path);
    const url = new URL(`${BASE}${path}`);
    if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(`${BASE_URL.pathname}/`)) {
        throw new Error(`Invalid path ${JSON.stringify(path)}: resolves outside the Fiken API`);
    }
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v != null) url.searchParams.set(k, String(v));
        }
    }
    return url;
}

const MIN_GAP_MS = 250;
const MAX_RETRIES = 3;
const MAX_NETWORK_RETRIES = 2;
const MAX_TOTAL_MS = 90_000;
const MAX_ERROR_BODY = 2000;
const BACKOFF_MS = 500;
const MAX_DELAY_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface Pagination {
    page?: number;
    pageSize?: number;
    pageCount?: number;
    resultCount?: number;
}

// Fiken allows one concurrent request per token: serialize everything
let chain: Promise<unknown> = Promise.resolve();
let lastStart = -Infinity;

/** Test-only: reset the queue and the spacing clock. */
export function _resetForTests(): void {
    chain = Promise.resolve();
    lastStart = -Infinity;
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn);
    chain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

async function pace(): Promise<void> {
    const wait = MIN_GAP_MS - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
}

function timeoutMs(): number {
    const n = Number(process.env.FIKEN_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function retryDelay(r: Response | undefined, attempt: number): number {
    const secs = parseFloat(r?.headers.get("Retry-After") ?? "");
    const ms = secs >= 0 ? secs * 1000 : BACKOFF_MS * 2 ** attempt;
    return Math.min(ms, MAX_DELAY_MS);
}

const AUTH_HINT = " (authentication failed: check that FIKEN_API_TOKEN is valid and has access)";

/** True when the body carries a specific Fiken message, i.e. the failure is not a generic auth rejection. */
function hasSpecificMessage(body: string): boolean {
    try {
        const j: unknown = JSON.parse(body);
        if (j && typeof j === "object") {
            const o = j as Record<string, unknown>;
            return [o.error_description, o.message].some((v) => typeof v === "string" && v !== "");
        }
    } catch {
        // not JSON: generic body
    }
    return false;
}

async function httpError(r: Response): Promise<Error> {
    let body = await r.text();
    // Fiken also answers 401 for non-auth reasons (e.g. "Offer counter not initialized"), so only
    // hint at the token when the body gives no specific reason.
    const hint =
        (r.status === 401 || r.status === 403) && !hasSpecificMessage(body) ? AUTH_HINT : "";
    if (body.length > MAX_ERROR_BODY) body = `${body.slice(0, MAX_ERROR_BODY)} ...[truncated]`;
    return new Error(`Fiken ${r.status}: ${body}${hint}`);
}

const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";

/**
 * Queue a request, then run `handle` on the response while still holding the slot.
 * Timeouts are never retried (they would hold the queue); GET network errors retry at most
 * MAX_NETWORK_RETRIES times, 429 any method, 503 GET only; total retry time is capped.
 */
function send<T>(
    method: string,
    path: string,
    url: URL,
    init: RequestInit,
    handle: (r: Response) => Promise<T>,
): Promise<T> {
    const ms = timeoutMs();
    const isGet = method === "GET";
    const timedOut = () => new Error(`Fiken request timed out after ${ms}ms: ${method} ${path}`);
    const attemptOnce = async (attempt: number, started: number): Promise<T> => {
        await pace();
        const mayRetry = (delay: number) => Date.now() - started + delay <= MAX_TOTAL_MS;
        let r: Response;
        try {
            r = await fetch(url, { ...init, method, signal: AbortSignal.timeout(ms) });
        } catch (e) {
            if (isTimeout(e)) throw timedOut();
            const delay = retryDelay(undefined, attempt);
            if (isGet && attempt < MAX_NETWORK_RETRIES && mayRetry(delay)) {
                await sleep(delay);
                return attemptOnce(attempt + 1, started);
            }
            throw e;
        }
        if (r.status === 429 || (r.status === 503 && isGet)) {
            const delay = retryDelay(r, attempt);
            if (attempt < MAX_RETRIES && mayRetry(delay)) {
                await sleep(delay);
                return attemptOnce(attempt + 1, started);
            }
        }
        try {
            return await handle(r);
        } catch (e) {
            // The timeout signal also covers reading the response body.
            throw isTimeout(e) ? timedOut() : e;
        }
    };
    return enqueue(() => attemptOnce(0, Date.now()));
}

async function parseMutationResponse(r: Response): Promise<unknown> {
    if (!r.ok) throw await httpError(r);
    if (r.status === 204) return { success: true };
    if (r.status === 201) return { created: true, location: r.headers.get("Location") };
    const text = await r.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: true };
    }
}

function num(r: Response, name: string): number | undefined {
    const n = parseInt(r.headers.get(name) ?? "", 10);
    return Number.isNaN(n) ? undefined : n;
}

function parsePagination(r: Response): Pagination | undefined {
    const p = {
        page: num(r, "Fiken-Api-Page"),
        pageSize: num(r, "Fiken-Api-Page-Size"),
        pageCount: num(r, "Fiken-Api-Page-Count"),
        resultCount: num(r, "Fiken-Api-Result-Count"),
    };
    return Object.values(p).some((v) => v !== undefined) ? p : undefined;
}

function getRaw<T>(path: string, params: Params | undefined, pick: (r: Response) => T) {
    const url = buildUrl(path, params);
    return send(
        "GET",
        path,
        url,
        { headers: { Authorization: `Bearer ${token()}` } },
        async (r) => {
            if (!r.ok) throw await httpError(r);
            const text = r.status === 204 ? "" : await r.text();
            return { data: text ? JSON.parse(text) : null, extra: pick(r) };
        },
    );
}

export async function get(path: string, params?: Params): Promise<unknown> {
    return (await getRaw(path, params, () => undefined)).data;
}

/** Like get(), plus pagination parsed from Fiken-Api-* response headers (undefined if absent). */
export async function getWithMeta(
    path: string,
    params?: Params,
): Promise<{ data: unknown; pagination: Pagination | undefined }> {
    const { data, extra } = await getRaw(path, params, parsePagination);
    return { data, pagination: extra };
}

export async function mutate(method: string, path: string, body?: unknown): Promise<unknown> {
    return send(
        method,
        path,
        buildUrl(path),
        {
            headers: {
                Authorization: `Bearer ${token()}`,
                "Content-Type": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        parseMutationResponse,
    );
}

export async function uploadMultipart(
    path: string,
    params: Params | undefined,
    form: FormData,
): Promise<unknown> {
    return send(
        "POST",
        path,
        buildUrl(path, params),
        { headers: { Authorization: `Bearer ${token()}` }, body: form },
        parseMutationResponse,
    );
}
