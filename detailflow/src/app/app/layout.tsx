import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app-nav";
import { getContext } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { switchCompany } from "@/app/actions/company";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  if (!ctx.company) redirect("/onboarding");
  const switcher = ctx.memberships.length > 1 ? (
    <form action={switchCompany} className="mt-1">
      <select name="company_id" defaultValue={ctx.companyId} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs">
        {ctx.memberships.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button className="mt-1 text-xs text-accent">Firma wechseln</button>
    </form>
  ) : undefined;
  return (
    <div className="min-h-dvh">
      <Sidebar companyName={ctx.company.name} userName={ctx.user.email ?? ""} signOut={signOut} companySwitcher={switcher} />
      <main className="pb-24 lg:pb-10 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
