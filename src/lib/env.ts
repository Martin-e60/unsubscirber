/**
 * Environment variables, read and validated once.
 *
 * Importing `env` anywhere guarantees the value exists and is the right shape.
 * A missing variable fails loudly at startup instead of producing a confusing
 * error deep inside an OAuth callback.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function base64Key(name: string): Buffer {
  const raw = required(name);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `${name} must be 32 bytes, base64 encoded. Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return buf;
}

export const env = {
  get appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get googleClientId(): string {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret(): string {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get sessionSecret(): Buffer {
    return base64Key("SESSION_SECRET");
  },
  get encryptionKey(): Buffer {
    return base64Key("ENCRYPTION_KEY");
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  /** The redirect URI that must be registered in Google Cloud Console. */
  get googleRedirectUri(): string {
    return `${env.appUrl}/api/auth/google/callback`;
  },
};
