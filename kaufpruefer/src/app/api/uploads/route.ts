import { getCurrentUser } from "@/lib/auth/session";
import { errorJson, rateLimit } from "@/lib/http";
import { getStore } from "@/lib/store";
import { maybeCleanup, storeImage } from "@/lib/uploads/service";
import { MAX_IMAGES_PER_REQUEST } from "@/lib/uploads/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an, um Dateien hochzuladen.");
  const rl = await rateLimit(`upload:${user.id}`, 3600, 120);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Uploads. Bitte versuche es später erneut.");
  maybeCleanup();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson(400, "invalid_form", "Ungültige Anfrage");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return errorJson(400, "no_files", "Keine Dateien erhalten");
  const maxImages = Math.min(30, (await getStore().getConfig()).limits?.maxImagesPerUpload ?? MAX_IMAGES_PER_REQUEST);
  if (files.length > maxImages) return errorJson(400, "too_many", `Maximal ${maxImages} Bilder pro Upload`);

  const out: { id: string; name: string }[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const f of files) {
    try {
      const rec = await storeImage(user.id, Buffer.from(await f.arrayBuffer()));
      out.push({ id: rec.id, name: f.name.slice(0, 80) });
    } catch (e) {
      errors.push({ name: f.name.slice(0, 80), message: (e as { code?: string }).code ? (e as Error).message : "Upload fehlgeschlagen" });
    }
  }
  return Response.json({ uploads: out, errors });
}
