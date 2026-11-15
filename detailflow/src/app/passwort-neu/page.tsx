import { NewPasswordForm } from "@/components/auth-forms";
export const metadata = { title: "Neues Passwort" };
export default function Page() {
  return <div className="flex min-h-dvh items-center justify-center px-4"><div className="w-full max-w-sm"><NewPasswordForm /></div></div>;
}
