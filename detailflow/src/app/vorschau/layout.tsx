import { notFound } from "next/navigation";
import { Sidebar } from "@/components/app-nav";

async function noop() { "use server"; }

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.DETAILFLOW_PREVIEW !== "1") notFound();
  return (
    <div className="min-h-dvh">
      <Sidebar companyName="Premium Detailing Köln" userName="inhaber@premium-detailing.test" signOut={noop} />
      <main className="pb-24 lg:pb-10 lg:pl-60"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div></main>
    </div>
  );
}
