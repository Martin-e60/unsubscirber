/**
 * Typed fetch wrapper used by every hook.
 *
 * One place that knows how to talk to the API means one place to change if
 * error handling, auth headers or base URLs ever need to change.
 */

import type { ApiError } from "./types";
import { MAILBOX_HEADER } from "@/lib/mailbox/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** The server's machine-readable reason, when it gave one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Per-request options. `mailboxId` names the mailbox the request is about;
 * the scoped client in src/lib/api/scoped.ts fills it in, so screens never
 * have to remember to.
 */
export type RequestOptions = {
  mailboxId?: string | null;
  signal?: AbortSignal;
};

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown; mailboxId?: string | null } = {},
): Promise<T> {
  const { json: body, mailboxId, ...rest } = init;

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(mailboxId ? { [MAILBOX_HEADER]: mailboxId } : {}),
      ...(rest.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : rest.body,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const data = (await response.json()) as ApiError;
      if (data?.error) message = data.error;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      // Response wasn't JSON — keep the generic message.
    }
    throw new ApiRequestError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api: ApiClient = {
  get: <T>(path: string, options: RequestOptions = {}) => request<T>(path, { ...options }),
  post: <T>(path: string, json?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { method: "POST", json, ...options }),
  patch: <T>(path: string, json?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { method: "PATCH", json, ...options }),
  del: <T>(path: string, options: RequestOptions = {}) =>
    request<T>(path, { method: "DELETE", ...options }),
};

/**
 * What a hook needs in order to talk to the app.
 *
 * `api` above is the real implementation. The demo ships a second one that
 * answers the same paths from the visitor's own browser, which is how /demo
 * runs the real screens with no account, no mailbox and no network — see
 * src/lib/demo/client.ts.
 */
export type ApiClient = {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, json?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T>(path: string, json?: unknown, options?: RequestOptions) => Promise<T>;
  del: <T>(path: string, options?: RequestOptions) => Promise<T>;
};
