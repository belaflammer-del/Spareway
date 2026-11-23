"use client";

import { FileText, ImagePlus, Users, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { uploadVideoWithProgress } from "@/lib/client/video";
import { cn } from "@/lib/utils";

type Method = "screenshots" | "screen_recording" | "pasted_text";

/** Verkäufer nachträglich prüfen – im bereits bezahlten Kaufcheck enthalten. */
export function SellerAddon({ analysisId, existing }: { analysisId: string; existing?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("screenshots");
  const [files, setFiles] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run() {
    try {
      let imageIds: string[] = [];
      if (method === "screenshots") {
        if (!files.length) return toast.error("Bitte Screenshots auswählen.");
        setBusy("Screenshots werden hochgeladen …");
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        const r = await fetch("/api/uploads", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message);
        imageIds = d.uploads.map((u: { id: string }) => u.id);
      }
      if (method === "screen_recording") {
        if (!video) return toast.error("Bitte eine Bildschirmaufnahme auswählen.");
        const d = await uploadVideoWithProgress(video, (pct, msg) => setBusy(`${msg} ${pct} %`));
        imageIds = d.frameIds;
        if (d.hint) toast.message(d.hint);
      }
      if (method === "pasted_text" && text.trim().length < 5) return toast.error("Bitte Bewertungstexte einfügen.");
      setBusy("Bewertungen werden ausgewertet …");
      const r = await fetch(`/api/analyses/${analysisId}/seller`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, imageIds, pastedText: method === "pasted_text" ? text : undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message ?? "Verkäuferprüfung fehlgeschlagen");
      toast.success(existing != null ? "Verkäuferdaten ergänzt" : "Verkäuferanalyse hinzugefügt");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Fehler");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-accent/50 bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <Users className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{existing != null ? "Verkäuferdaten ergänzen" : "Verkäufer jetzt überprüfen"}</p>
          <p className="text-xs text-muted">
            {existing != null ? `Bisher ${existing} Bewertungen erfasst – neue werden zusammengeführt, Duplikate erkannt.` : "Im Kaufcheck enthalten – kein weiterer Token."}
          </p>
        </div>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Starten
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {(
              [
                ["screenshots", "Screenshots", ImagePlus],
                ["screen_recording", "Aufnahme", Video],
                ["pasted_text", "Text", FileText],
              ] as const
            ).map(([m, l, Icon]) => (
              <button key={m} onClick={() => setMethod(m)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm", method === m ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                <Icon className="size-4" /> {l}
              </button>
            ))}
          </div>
          {method === "screenshots" && (
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))} />
          )}
          {method === "screen_recording" && (
            <div className="text-sm">
              <p className="text-muted">Bewertungsprofil öffnen, Aufnahme starten, langsam scrollen, hochladen (max. 90 s).</p>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" className="mt-2 block w-full" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {method === "pasted_text" && <Textarea rows={5} placeholder="Bewertungen einfügen – eine pro Absatz" value={text} onChange={(e) => setText(e.target.value)} />}
          <Button className="w-full" onClick={run} disabled={!!busy}>
            {busy ? (
              <>
                <Spinner /> {busy}
              </>
            ) : (
              "Bewertungen auswerten"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
