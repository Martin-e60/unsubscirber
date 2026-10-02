import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { HttpError } from "@/lib/api/respond";
import { env } from "@/lib/env";
import type { SystemEmail } from "@/lib/mail/system";
import { limitAuthAttempts } from "./credentials";
import { hashPassword } from "./password";

/**
 * Password recovery for email-and-password accounts, on the same scrypt
 * hashes as sign-in.
 *
 *   request   an email address in; if an account has it, a one-time link
 *             out. The answer is the same either way, so the page cannot be
 *             used to find out who has an account.
 *   reset     the link's token and a new password in; the password changes,
 *             the token is spent, and every older session stops working.
 *
 * Tokens are 256 random bits, kept only as SHA-256 hashes, valid for 30
 * minutes and only once. The link carries the token after "#", which
 * browsers never send to a server, so it stays out of logs and Referer
 * headers; the reset page posts it.
 */

export const RESET_TTL_MS = 30 * 60 * 1000;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const resetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(128),
});

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetLink(token: string): string {
  return `${env.appUrl}/reset-password#token=${token}`;
}

export function resetEmail(to: string, link: string): SystemEmail {
  return {
    to,
    subject: "Reset your Tidely password",
    text: [
      "Someone asked to reset the password for your Tidely account.",
      "",
      "To choose a new password, open this link within 30 minutes:",
      link,
      "",
      "If that wasn't you, ignore this email. Your password stays as it is.",
      "",
      "— Tidely",
    ].join("\n"),
  };
}

/** Sends a reset link if the address has an account; says nothing either way. */
export async function requestPasswordReset(
  rawEmail: unknown,
  send: (message: SystemEmail) => Promise<void>,
  now = Date.now(),
): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new HttpError("Enter a valid email address.", 400);
  const email = parsed.data;

  await limitAuthAttempts("reset", email, now);

  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return;

  // One live link per account: asking again replaces the last one.
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now + RESET_TTL_MS),
  });

  await send(resetEmail(user.email, resetLink(token)));
}

const EXPIRED = "This reset link has expired or has already been used. Ask for a new one.";

/** Sets a new password from a reset link. Returns the account's id. */
export async function resetPassword(input: unknown, now = Date.now()): Promise<string> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.some((issue) => issue.path[0] === "password");
    throw new HttpError(passwordIssue ? "Use a password of 12 to 128 characters." : EXPIRED, 400);
  }
  const { token, password } = parsed.data;

  // Spend the token first, atomically: of two tabs racing with the same
  // link, only one gets past this.
  const [claimed] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date(now) })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashResetToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date(now)),
      ),
    )
    .returning({ id: passwordResetTokens.id, userId: passwordResetTokens.userId });
  if (!claimed) throw new HttpError(EXPIRED, 400);

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, passwordChangedAt: new Date(now) })
    .where(eq(users.id, claimed.userId));

  // Any other outstanding link for this account is void now too.
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, claimed.userId), ne(passwordResetTokens.id, claimed.id)));

  return claimed.userId;
}
