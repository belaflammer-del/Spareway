import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/misc";
import { LEGAL_DOCS } from "@/lib/legal/docs";

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/rechtliches/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: LEGAL_DOCS[doc]?.title ?? "Rechtliches" };
}

export default async function LegalPage({ params }: PageProps<"/rechtliches/[doc]">) {
  const { doc } = await params;
  const d = LEGAL_DOCS[doc];
  if (!d) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Alert tone="warn" title="Entwurf – juristisch zu prüfen" className="mb-8">
        Dieser Text ist ein technischer Entwurf und keine Rechtsberatung. Vor dem kommerziellen Betrieb muss er von einer Rechtsanwältin bzw. einem Rechtsanwalt geprüft und vervollständigt werden.
      </Alert>
      <h1 className="text-3xl font-semibold tracking-tight">{d.title}</h1>
      <div className="mt-8 space-y-8">
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/85">
              {s.p.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
