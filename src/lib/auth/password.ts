import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt baseline. Node's implementation keeps password work off the
// event loop; each record has its own random salt.
const PREFIX = "scrypt$131072$8$1";
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const valid = stored?.match(/^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  // Unknown accounts and Google-only accounts still do the same password work.
  const actual = await derive(password, valid ? Buffer.from(valid[1], "hex") : Buffer.alloc(16));
  const expected = valid ? Buffer.from(valid[2], "hex") : Buffer.alloc(64);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
