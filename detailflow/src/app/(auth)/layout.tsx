import Link from "next/link";
import { Logo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/env";
import { Notice } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo className="text-lg" /></Link>
      <div className="w-full max-w-sm animate-in">
        {!isSupabaseConfigured() && (
          <div className="mb-4"><Notice tone="amber">Supabase ist noch nicht konfiguriert. Trage die Werte aus <code>.env.example</code> in <code>.env.local</code> ein.</Notice></div>
        )}
        {children}
      </div>
    </div>
  );
}
