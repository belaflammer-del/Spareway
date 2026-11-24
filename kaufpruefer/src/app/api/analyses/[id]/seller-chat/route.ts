import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { startChatCheck } from "@/lib/chat/service";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const Body = z.object({
  method: z.enum(["screenshots", "screen_recording", "pasted_text"]),
  imageIds: z.array(z.string().regex(/^up_[a-z0-9]{6,32}$/)).max(30).default([]),
  pastedText: z.string().max(30000).optional(),
  redact: z.boolean().default(true),
});

/** Verkäuferchat prüfen – läuft als Hintergrundjob, Fortschritt über /api/jobs/{id}. */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/seller-chat">) {
  return akteRoute("chatcheck", 20, async (user) => {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    const r = await startChatCheck(user.id, id, parsed.data);
    return Response.json(r, { status: r.reused ? 200 : 202 });
  });
}

/** Eine Chatprüfung löschen (Datenschutz: Nutzer kann jederzeit löschen). */
export async function DELETE(req: Request, ctx: RouteContext<"/api/analyses/[id]/seller-chat">) {
  return akteRoute("chatcheck-del", 60, async (user) => {
    const moduleId = new URL(req.url).searchParams.get("moduleId") ?? "";
    const { id } = await ctx.params;
    const store = getStore();
    const mod = (await store.listModules(id, user.id, "chat_check")).find((m) => m.id === moduleId);
    if (!mod) return errorJson(404, "not_found", "Chatprüfung nicht gefunden");
    await store.deleteModule(mod.id, user.id);
    return Response.json({ ok: true });
  });
}
