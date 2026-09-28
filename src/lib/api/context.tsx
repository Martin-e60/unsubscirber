"use client";

import { createContext, useContext, type ReactNode } from "react";
import { api, type ApiClient } from "@/lib/api/client";

/**
 * Which client the hooks talk to.
 *
 * The default is the real one, so every signed-in screen behaves exactly as it
 * did before this context existed and no page has to opt in. Wrapping a subtree
 * in <ApiProvider> swaps the implementation for everything inside it; that is
 * the whole mechanism behind the public demo.
 */

const ApiContext = createContext<ApiClient>(api);

export function ApiProvider({
  client,
  children,
}: {
  client: ApiClient;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  return useContext(ApiContext);
}
