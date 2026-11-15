import { AlertTriangle, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { BeforeAfter, PhotoUpload } from "@/components/photos";
import { addChecklist, deleteChecklist, deletePhoto, reportProblem, toggleChecklistItem } from "@/app/actions/operations";
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_LABELS, type PhotoCategory } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import type { AppContext } from "@/lib/auth";

type Photo = { id: string; category: PhotoCategory; storage_path: string; caption: string | null; created_at: string; url?: string };

export async function OrderPhotos({ ctx, orderId }: { ctx: AppContext; orderId: string }) {
  const { data } = await ctx.supabase.from("order_photos").select("id, category, storage_path, caption, created_at").eq("order_id", orderId).order("created_at");
  const photos = (data ?? []) as Photo[];
  if (photos.length) {
    const { data: signed } = await ctx.supabase.storage.from("company-files").createSignedUrls(photos.map((p) => p.storage_path), 3600);
    photos.forEach((p, i) => (p.url = signed?.[i]?.signedUrl ?? undefined));
  }
  const before = photos.find((p) => p.category === "vorher" && p.url);
  const after = [...photos].reverse().find((p) => p.category === "nachher" && p.url);
  const canDelete = ctx.role !== "staff";
  return (
    <Card>
      <CardHeader title="Fotodokumentation" description={`${photos.length} Foto(s) · nur für dein Team sichtbar`} />
      <div className="space-y-5 p-5">
        {before && after && <BeforeAfter before={before.url!} after={after.url!} />}
        {PHOTO_CATEGORIES.filter((c) => photos.some((p) => p.category === c)).map((c) => (
          <div key={c}>
            <p className="mb-2 text-sm font-medium">{PHOTO_CATEGORY_LABELS[c]}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.filter((p) => p.category === c).map((p) => (
                <figure key={p.id} className="group relative">
                  <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.caption ?? PHOTO_CATEGORY_LABELS[c]} className="aspect-square w-full rounded-lg object-cover" loading="lazy" /></a>
                  {p.caption && <figcaption className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.caption}</figcaption>}
                  {canDelete && (
                    <form action={deletePhoto} className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-md bg-black/60 p-1 text-white" aria-label="Foto löschen"><Trash2 className="size-3.5" /></button>
                    </form>
                  )}
                </figure>
              ))}
            </div>
          </div>
        ))}
        <PhotoUpload orderId={orderId} defaultCategory={photos.some((p) => p.category === "vorher") ? "nachher" : "vorher"} />
      </div>
    </Card>
  );
}

type Item = { id: string; label: string; sort: number; done: boolean; done_by: string | null; done_at: string | null; problem: string | null };
export async function OrderChecklists({ ctx, orderId, names }: { ctx: AppContext; orderId: string; names: Record<string, string> }) {
  const [{ data: lists }, { data: templates }] = await Promise.all([
    ctx.supabase.from("order_checklists").select("id, name, created_at, order_checklist_items(id, label, sort, done, done_by, done_at, problem)").eq("order_id", orderId).order("created_at"),
    ctx.supabase.from("checklist_templates").select("id, name").eq("company_id", ctx.companyId).eq("active", true).order("sort"),
  ]);
  const used = new Set((lists ?? []).map((l) => l.name));
  return (
    <Card>
      <CardHeader title="Checklisten" description="Schritte abhaken – wer und wann wird automatisch notiert." />
      <div className="divide-y divide-border">
        {(lists ?? []).map((l) => {
          const items = [...(l.order_checklist_items as Item[])].sort((a, b) => a.sort - b.sort);
          const done = items.filter((i) => i.done).length;
          return (
            <details key={l.id} open={done < items.length} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
                <span className="font-medium">{l.name}</span>
                <span className={`text-sm ${done === items.length ? "text-accent" : "text-muted-foreground"}`}>{done}/{items.length}</span>
              </summary>
              <ul className="pb-2">
                {items.map((it) => (
                  <li key={it.id} className="px-5 py-1.5">
                    <div className="flex items-start gap-3">
                      <form action={toggleChecklistItem}>
                        <input type="hidden" name="id" value={it.id} /><input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="done" value={String(!it.done)} />
                        <button aria-label={it.done ? "Als offen markieren" : "Erledigt"} className="mt-0.5">{it.done ? <CheckCircle2 className="size-5 text-accent" /> : <Circle className="size-5 text-muted-foreground" />}</button>
                      </form>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className={it.done ? "text-muted-foreground line-through" : ""}>{it.label}</p>
                        {it.done && it.done_at && <p className="text-xs text-muted-foreground">{names[it.done_by ?? ""] ?? "Mitarbeiter"} · {formatDateTime(it.done_at)}</p>}
                        {it.problem && <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3" />{it.problem}</p>}
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{it.problem ? "Problem bearbeiten" : "Problem melden"}</summary>
                          <form action={reportProblem} className="mt-1 flex gap-2">
                            <input type="hidden" name="id" value={it.id} /><input type="hidden" name="order_id" value={orderId} />
                            <input name="problem" defaultValue={it.problem ?? ""} placeholder="Was ist aufgefallen?" className="h-8 flex-1 rounded-md border border-border bg-card px-2 text-xs" />
                            <button className={buttonClass("secondary", "sm")}>Speichern</button>
                          </form>
                        </details>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {ctx.role !== "staff" && (
                <form action={deleteChecklist} className="px-5 pb-3"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="order_id" value={orderId} /><button className="text-xs text-muted-foreground hover:text-danger">Checkliste entfernen</button></form>
              )}
            </details>
          );
        })}
      </div>
      <form action={addChecklist} className="flex gap-2 border-t border-border p-4">
        <input type="hidden" name="order_id" value={orderId} />
        <select name="template_id" required className="h-9 flex-1 rounded-lg border border-border bg-card px-2 text-sm" defaultValue="">
          <option value="" disabled>Checkliste hinzufügen …</option>
          {(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{used.has(t.name) ? " (bereits vorhanden)" : ""}</option>)}
        </select>
        <button className={buttonClass("secondary", "sm", "h-9")}>Hinzufügen</button>
      </form>
    </Card>
  );
}
