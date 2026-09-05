import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/api/auth";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = { title: "Create an account — Tidely" };

export default async function RegisterPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthPage mode="register" error={(await searchParams).error} />;
}
