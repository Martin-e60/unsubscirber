import { loadEnvConfig } from "@next/env";

// Match Next's .env* precedence in standalone database commands.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
