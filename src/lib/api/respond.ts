import "server-only";
import { NextResponse } from "next/server";

/**
 * Small helpers so every route handler returns the same shapes and no route
 * ever leaks a stack trace to the browser.
 */

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
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
        return apiError(error.message, error.status);
      }
      console.error("[api] unhandled error:", error);
      return apiError("Something went wrong on the server.", 500);
    }
  };
}
