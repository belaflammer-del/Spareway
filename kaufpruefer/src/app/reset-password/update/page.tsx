import type { Metadata } from "next";
import { AuthForm, AuthShell } from "@/components/auth/auth-form";
import { updatePasswordAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Neues Passwort" };

export default async function UpdatePasswordPage({ searchParams }: PageProps<"/reset-password/update">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : undefined;
  return (
    <AuthShell title="Neues Passwort festlegen">
      <AuthForm action={updatePasswordAction} kind="update" token={token} />
    </AuthShell>
  );
}
