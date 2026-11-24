import { clientIpHash, rateLimit } from "@/lib/http";
import { getStore } from "@/lib/store";
import { storeImage } from "@/lib/uploads/service";
import { newId, nowIso } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const INBOX_MINUTES = 30;

function clip(v: FormDataEntryValue | string | null, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

function redirect(to: string) {
  return new Response(null, { status: 303, headers: { Location: to } });
}

/**
 * Web Share Target (PWA, v. a. Android/Chrome). Das Betriebssystem sendet hier
 * Titel, Text, URL und ggf. Bilder hin. Die Inhalte landen in einem kurzlebigen,
 * einmalig abholbaren Eingang und werden erst nach Bestätigung durch den
 * angemeldeten Nutzer weiterverarbeitet – es startet nie automatisch eine
 * kostenpflichtige Analyse.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(`share:${await clientIpHash()}`, 3600, 30);
  if (!rl.allowed) return redirect("/teilen?error=rate");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_TOTAL_BYTES) return redirect("/teilen?error=too_large");
  const form = await req.formData().catch(() => null);
  if (!form) return redirect("/teilen?error=invalid");

  const id = newId("sh");
  const owner = `share_${id.replace(/[^a-z0-9]/gi, "")}`;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_FILES);
  const uploadIds: string[] = [];
  for (const f of files) {
    try {
      uploadIds.push((await storeImage(owner, Buffer.from(await f.arrayBuffer()))).id);
    } catch {
      /* nicht unterstützte Dateien werden übersprungen */
    }
  }
  const now = Date.now();
  await getStore().putShareInbox({
    id,
    createdAt: nowIso(),
    expiresAt: new Date(now + INBOX_MINUTES * 60_000).toISOString(),
    title: clip(form.get("title"), 300),
    text: clip(form.get("text"), 4000),
    url: clip(form.get("url"), 2000),
    uploadIds,
  });
  const skipped = files.length - uploadIds.length;
  return redirect(`/teilen?inbox=${encodeURIComponent(id)}${skipped ? `&skipped=${skipped}` : ""}`);
}

/** GET-Variante (z. B. aus nativen Apps oder Lesezeichen): nur Text/URL. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  for (const k of ["url", "text", "title"]) {
    const v = clip(sp.get(k), k === "text" ? 4000 : 2000);
    if (v) q.set(k, v);
  }
  return redirect(`/teilen?${q.toString()}`);
}
