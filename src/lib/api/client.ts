/**
 * Typed fetch wrapper used by every hook.
 *
 * One place that knows how to talk to the API means one place to change if
 * error handling, auth headers or base URLs ever need to change.
 */

import type { ApiError } from "./types";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json: body, ...rest } = init;

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : rest.body,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as ApiError;
      if (data?.error) message = data.error;
    } catch {
      // Response wasn't JSON — keep the generic message.
    }
    throw new ApiRequestError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json }),
  patch: <T>(path: string, json?: unknown) =>
    request<T>(path, { method: "PATCH", json }),
};
