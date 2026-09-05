"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { SessionDto } from "@/lib/api/types";

/**
 * Who is signed in, and is a mailbox connected.
 *
 * Every page that needs the user calls this. It holds no UI concerns at all.
 */
export function useSession() {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [loading, setLoading] = useState(true);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.post("/api/auth/logout");
    window.location.href = "/";
  }, []);

  return {
    session,
    user: session?.user ?? null,
    account: session?.account ?? null,
    isSignedIn: Boolean(session?.user),
    loading,
    error,
    refresh,
    signOut,
  };
}
