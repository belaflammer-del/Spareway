import type { Metadata } from "next";
import { ShareLanding } from "@/components/share/share-landing";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Geteiltes Angebot", robots: { index: false } };

export default async function SharePage({ searchParams }: PageProps<"/teilen">) {
  const sp = await searchParams;
  const one = (k: string, max: number) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, max) : undefined);
  const user = await getCurrentUser();
  const inbox = one("inbox", 60);
  return (
    <ShareLanding
      loggedIn={!!user}
      inboxId={inbox && /^sh_[a-z0-9]{6,32}$/.test(inbox) ? inbox : undefined}
      url={one("url", 2000)}
      text={one("text", 4000)}
      title={one("title", 300)}
      error={one("error", 20)}
      skipped={Number(one("skipped", 3) ?? 0) || 0}
    />
  );
}
