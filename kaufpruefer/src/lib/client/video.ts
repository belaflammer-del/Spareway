/** Lädt eine Bildschirmaufnahme hoch und verfolgt die Verarbeitung (Browser). */
export async function uploadVideoWithProgress(
  file: File,
  onProgress: (pct: number, message: string) => void,
): Promise<{ frameIds: string[]; hint?: string; stats?: { durationSeconds: number; keptFrames: number } }> {
  const fd = new FormData();
  fd.append("video", file);
  onProgress(1, "Video wird hochgeladen …");
  const r = await fetch("/api/uploads/video", { method: "POST", body: fd });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? "Videoverarbeitung fehlgeschlagen");
  for (let i = 0; i < 300; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const s = await fetch(`/api/uploads/video/${d.jobId}`, { cache: "no-store" });
    const j = await s.json();
    if (!s.ok) throw new Error(j.error?.message ?? "Status nicht abrufbar");
    onProgress(j.progress, j.message);
    if (j.stage === "done") return { frameIds: j.frameIds, hint: j.hint, stats: j.stats };
    if (j.stage === "failed") throw new Error(j.error ?? "Verarbeitung fehlgeschlagen");
  }
  throw new Error("Die Verarbeitung dauert ungewöhnlich lange. Bitte versuche eine kürzere Aufnahme.");
}
