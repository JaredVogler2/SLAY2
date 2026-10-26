import { UnsupportedBuildError, type ErrorEnvelope } from "@slay2/game-schema";
import type { Rational } from "@slay2/odds";

/** JSON shape of an exact probability: the fraction is the value, `approx` is for display only. */
export interface RationalOut {
  n: string;
  d: string;
  approx: number;
}

export function rationalOut(r: Rational): RationalOut {
  return { n: r.n.toString(), d: r.d.toString(), approx: r.toNumber() };
}

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

export function jsonOk(data: unknown, init: { status?: number; cache?: string } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, ...(init.cache ? { "Cache-Control": init.cache } : {}) },
  });
}

export type ErrorCode = ErrorEnvelope["error"]["code"];

export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: { path: string; message: string }[],
): Response {
  const body: ErrorEnvelope = { error: { code, message, ...(details ? { details } : {}) } };
  return new Response(JSON.stringify(body), { status, headers: BASE_HEADERS });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON request body with a hard size cap (413) and strict parsing (400). */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "invalid_request", "Content-Type must be application/json");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Request body exceeds ${String(maxBytes)} bytes`);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, "payload_too_large", `Request body exceeds ${String(maxBytes)} bytes`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_request", "Request body is not valid JSON");
  }
}

/** Best-effort per-instance limiter (real flood protection belongs to the platform firewall; see docs/DEPLOY.md). */
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute = 120, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  const refill = ((now - b.at) / 60_000) * perMinute;
  b.tokens = Math.min(perMinute, b.tokens + refill);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) {
    buckets.clear();
  }
  return true;
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim() ?? "";
  return first.length > 0 ? first : "anonymous";
}

/** Maps domain errors to the documented envelope (400 invalid, 413 too large, 422 unsupported, 429 limited, 500). */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return jsonError(e.code, e.message, e.status, e.details);
  }
  if (e instanceof UnsupportedBuildError) {
    return jsonError("unsupported_build", e.message, 422);
  }
  const named = e as { code?: unknown; details?: unknown; message?: unknown };
  if (named.code === "invalid_request") {
    return jsonError(
      "invalid_request",
      String(named.message),
      400,
      Array.isArray(named.details)
        ? (named.details as { path: string; message: string }[])
        : undefined,
    );
  }
  return jsonError("internal_error", "Unexpected error", 500);
}

/** Wraps a handler with the rate limit and error mapping. */
export function guarded(
  handler: (request: Request) => Promise<Response> | Response,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!rateLimit(clientKey(request))) {
      return jsonError("rate_limited", "Too many requests; slow down.", 429);
    }
    try {
      return await handler(request);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}
