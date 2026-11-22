import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { loadOwnedUpload } from "@/lib/uploads/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  try {
    const { rec, data } = await loadOwnedUpload(id, [user.id]);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": rec.mime,
        "Cache-Control": "private, max-age=3600",
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorJson(404, "not_found", "Datei nicht gefunden oder bereits gelöscht");
  }
}
