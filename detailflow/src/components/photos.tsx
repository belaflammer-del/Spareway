"use client";
import { useActionState, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { uploadPhotos } from "@/app/actions/operations";
import { Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_LABELS } from "@/lib/domain";

export function PhotoUpload({ orderId, defaultCategory = "vorher" }: { orderId: string; defaultCategory?: string }) {
  const [state, action] = useActionState(uploadPhotos, undefined);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="order_id" value={orderId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select name="category" defaultValue={defaultCategory} className="sm:w-56" aria-label="Kategorie">
          {PHOTO_CATEGORIES.map((c) => <option key={c} value={c}>{PHOTO_CATEGORY_LABELS[c]}</option>)}
        </Select>
        <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-muted">
          <Camera className="size-4" />{count ? `${count} Foto(s) ausgewählt` : "Fotos aufnehmen oder auswählen"}
          <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" onChange={(e) => setCount(e.target.files?.length ?? 0)} />
        </label>
      </div>
      <input name="caption" placeholder="Beschreibung (optional), z. B. „Kratzer Tür hinten links“" maxLength={300} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" />
      <div className="flex items-center gap-3"><SubmitButton pendingText="Wird hochgeladen …">Hochladen</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

/** Vorher/Nachher-Vergleich mit Schieberegler */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted select-none">
      <img src={after} alt="Nachher" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="Vorher" className="absolute inset-0 size-full object-cover" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">Vorher</span>
      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">Nachher</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Vorher/Nachher vergleichen" className="absolute inset-x-4 bottom-3 accent-white" />
    </div>
  );
}
