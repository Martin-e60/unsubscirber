"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api/context";
import type { ApiClient } from "@/lib/api/client";
import type { MailboxDto, SessionDto } from "@/lib/api/types";

/**
 * The last session this browser tab loaded, so moving between pages does not
 * show a loading state while /api/me is asked again (it still is, and the
 * answer replaces this). Browser only: on the server a module-level value
 * would be shared between requests. A full page load starts empty, which is
 * also what keeps the first render identical to the server's.
 */
let cached: { client: ApiClient; session: SessionDto } | null = null;

function cachedFor(client: ApiClient): SessionDto | null {
  if (typeof window === "undefined") return null;
  return cached?.client === client ? cached.session : null;
}

/**
 * Who is signed in, and which mailboxes are connected.
 *
 * Every page that needs the user calls this. It holds no UI concerns at all.
 * Use it with the unscoped client: it is about the person, not one mailbox.
 */
export function useSession() {
  const api = useApi();
  const [session, setSessionState] = useState<SessionDto | null>(() => cachedFor(api));
  const [loading, setLoading] = useState(() => cachedFor(api) === null);

  const setSession = useCallback(
    (next: SessionDto | null | ((current: SessionDto | null) => SessionDto | null)) => {
      setSessionState((current) => {
        const value = typeof next === "function" ? next(current) : next;
        if (typeof window !== "undefined") cached = value && value.user ? { client: api, session: value } : null;
        return value;
      });
    },
    [api],
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get<SessionDto>("/api/me"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load session");
    } finally {
      setLoading(false);
    }
  }, [api, setSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    cached = null;
    await api.post("/api/auth/logout");
    window.location.href = "/";
  }, [api]);

  /** Applies a mailbox list the server just returned, without another request. */
  const setMailboxes = useCallback(
    (mailboxes: MailboxDto[], activeMailboxId?: string | null) => {
      setSession((current) =>
        current
          ? {
              ...current,
              mailboxes,
              activeMailboxId:
                activeMailboxId === undefined ? current.activeMailboxId : activeMailboxId,
            }
          : current,
      );
    },
    [setSession],
  );

  return {
    session,
    user: session?.user ?? null,
    account: session?.account ?? null,
    mailboxes: session?.mailboxes ?? [],
    isSignedIn: Boolean(session?.user),
    loading,
    error,
    refresh,
    setMailboxes,
    signOut,
  };
}
