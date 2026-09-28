import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = { title: "Create an account — Tidely" };

export default async function RegisterPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await readSession()) redirect("/dashboard");
  return <AuthPage mode="register" error={(await searchParams).error} />;
}
