import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InspectionMode } from "@/components/akte/inspection-mode";
import { akteLimits } from "@/lib/akte/limits";
import { requireUser } from "@/lib/auth/session";
import { providerEnabled } from "@/lib/config/providers";
import { latestInspection, startInspection } from "@/lib/inspection/service";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Besichtigung", robots: { index: false } };

export default async function InspectionPage({ params }: PageProps<"/analysis/[id]/besichtigung">) {
  const { id } = await params;
  const user = await requireUser(`/analysis/${id}/besichtigung`);
  const a = await getStore().getAnalysis(id, user.id);
  if (!a?.report) notFound();
  // Startet beim ersten Öffnen (ohne KI, ohne Kosten) bzw. setzt die laufende Besichtigung fort
  const mod = (await latestInspection(user.id, id)) ?? (await startInspection(user.id, id).catch(() => null));
  if (!mod) notFound();
  const lim = akteLimits(await getStore().getConfig());
  return (
    <InspectionMode
      key={mod.id}
      analysisId={id}
      title={a.title}
      moduleId={mod.id}
      version={mod.version}
      initial={mod.data}
      aiAvailable={await providerEnabled("ai")}
      photoAiLimit={lim.inspectionPhotoAiMax}
    />
  );
}
