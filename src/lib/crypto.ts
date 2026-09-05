import crypto from "node:crypto";
import { env } from "./env";

/**
 * Symmetric encryption for OAuth tokens at rest.
 *
 * A Google refresh token is a long-lived key to someone's mailbox. Storing it
 * in plaintext means a leaked database dump is a leaked mailbox, so every token
 * is encrypted with AES-256-GCM before it reaches Prisma and decrypted only at
 * the moment an API call needs it.
 *
 * Layout of the stored string: base64( iv[12] | authTag[16] | ciphertext )
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", env.encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted payload is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", env.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time string comparison, used for OAuth state validation. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
