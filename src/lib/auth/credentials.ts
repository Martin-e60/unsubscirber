import "server-only";
import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authAttempts, users } from "@/db/schema";
import { HttpError } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";

const email = z.string().trim().toLowerCase().email().max(254);
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(128),
});

export function requireAuthOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(env.appUrl).origin) {
    throw new HttpError("Please submit this form from Tidely.", 403);
  }
}

export async function limitAuthAttempts(action: "login" | "register", email: string, now = Date.now()) {
  const key = `${action}:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
  const expiresAt = now + 15 * 60 * 1000;
  await db.delete(authAttempts).where(lt(authAttempts.expiresAt, now));
  const [counter] = await db.insert(authAttempts).values({ key, attempts: 1, expiresAt })
    .onConflictDoUpdate({ target: authAttempts.key, set: {
      attempts: sql`${authAttempts.attempts} + 1`,
    } }).returning();
  if (counter.attempts > 10) throw new HttpError("Too many attempts. Please try again in 15 minutes.", 429);
}

export async function registerWithPassword(input: unknown) {
  const data = registerSchema.parse(input);
  await limitAuthAttempts("register", data.email);
  const passwordHash = await hashPassword(data.password);
  const [user] = await db.insert(users).values({ email: data.email, name: data.name, passwordHash })
    .onConflictDoNothing({ target: users.email }).returning({ id: users.id });
  if (!user) throw new HttpError("Unable to create this account. Try logging in instead.", 409);
  return user.id;
}

export async function loginWithPassword(input: unknown) {
  const data = loginSchema.parse(input);
  await limitAuthAttempts("login", data.email);
  const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (!await verifyPassword(data.password, user?.passwordHash ?? null)) {
    throw new HttpError("Email or password is incorrect.", 401);
  }
  return user.id;
}
