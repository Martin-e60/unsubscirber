import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = { title: "Log in — Tidely" };

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await readSession()) redirect("/dashboard");
  return <AuthPage mode="login" error={(await searchParams).error} />;
}
