import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { getStore } from "@/lib/store";

/** DSGVO Art. 15/20: Export der eigenen Daten als JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const data = await getStore().exportUserData(user.id);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="kaufklar-datenexport.json"`, "Cache-Control": "no-store" },
  });
}
