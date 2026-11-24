import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatCheckFlow } from "@/components/akte/chat-check";
import { akteLimits } from "@/lib/akte/limits";
import { getAkte } from "@/lib/akte/service";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { providerEnabled } from "@/lib/config/providers";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Verkäuferchat prüfen", robots: { index: false } };

export default async function ChatPage({ params }: PageProps<"/analysis/[id]/chat">) {
  const { id } = await params;
  const user = await requireUser(`/analysis/${id}/chat`);
  const akte = await getAkte(user.id, id);
  if (!akte) notFound();
  const lim = akteLimits(await getStore().getConfig());
  return (
    <ChatCheckFlow
      analysisId={id}
      title={akte.analysis.title}
      checks={akte.chats.map((c) => ({ id: c.id, version: c.version, createdAt: c.createdAt, expiresAt: c.expiresAt, data: c.data }))}
      limit={lim.chatChecksPerAnalysis}
      maxScreenshots={lim.chatScreenshotsMax}
      retentionDays={lim.retention.chatDays}
      aiAvailable={await providerEnabled("ai")}
      videoMaxSeconds={env.videoMaxSeconds}
    />
  );
}
