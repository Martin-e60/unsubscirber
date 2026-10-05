import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Small helpers so every route handler returns the same shapes and no route
 * ever leaks a stack trace to the browser.
 */

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** A stable reason the browser can react to, e.g. "mailbox_not_found". */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Reject broken JSON before a handler can change data or contact a mailbox. */
export async function readJson(
  request: Request,
  options: { allowEmpty?: boolean } = {},
): Promise<unknown> {
  const text = await request.text();
  if (options.allowEmpty && !text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("Request body must contain valid JSON.", 400);
  }
}

/**
 * readJson for routes that change mail: the body must also be declared as
 * JSON. A cross-site form cannot send that content type without a CORS
 * preflight, which this app never grants — a second line of defence behind
 * the SameSite session cookie.
 */
export async function readJsonRequest(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError("Request body must be JSON.", 415);
  }
  return readJson(request);
}

/**
 * Wraps a route handler so thrown errors become clean JSON responses.
 *
 * An HttpError is intentional and its message is safe to show. Anything else
 * is a bug: it is logged on the server and reported to the browser as a
 * generic 500.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return apiError(error.message, error.status, error.code);
      }
      if (error instanceof ZodError) {
        return apiError("Invalid request parameters.", 400);
      }
      console.error("[api] unhandled error:", error);
      return apiError("Something went wrong on the server.", 500);
    }
  };
}
