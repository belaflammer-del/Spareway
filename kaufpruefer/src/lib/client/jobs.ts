/** Fragt den Status eines Hintergrundjobs ab, bis er fertig ist. */
export async function pollJob(
  jobId: string,
  onProgress: (pct: number, message: string) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ status: string; result?: Record<string, unknown>; error?: string }> {
  const until = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  while (Date.now() < until) {
    const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message ?? "Status nicht abrufbar");
    onProgress(d.progress ?? 0, d.message ?? "");
    if (d.status === "done" || d.status === "failed" || d.status === "cancelled") return d;
    await new Promise((res) => setTimeout(res, opts.intervalMs ?? 1500));
  }
  throw new Error("Die Verarbeitung dauert ungewöhnlich lange. Schau später in der Kaufakte nach.");
}

/** Bilder hochladen (gibt Upload-IDs zurück). */
export async function uploadFiles(files: File[]): Promise<string[]> {
  if (!files.length) return [];
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const r = await fetch("/api/uploads", { method: "POST", body: fd });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? "Upload fehlgeschlagen");
  return d.uploads.map((u: { id: string }) => u.id);
}

export async function postJson<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message ?? "Aktion fehlgeschlagen");
  return d as T;
}
