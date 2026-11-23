"use client";

import { MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

interface Entry {
  q: string;
  a: string;
  at: string;
  grounded: boolean;
}

const SUGGESTIONS: Record<string, string[]> = {
  vehicle: ["Ist dieser Kilometerstand ungewöhnlich?", "Was sollte ich bei der Besichtigung kontrollieren?", "Was wäre ein sinnvoller Verhandlungspreis?"],
  default: ["Welche Fragen soll ich dem Verkäufer stellen?", "Was wäre ein sinnvoller Verhandlungspreis?", "Welche Risiken sind am wichtigsten?"],
};

/** Rückfragen an den KI-Assistenten – Antworten basieren nur auf dem Bericht. */
export function ReportAssistant({ analysisId, initial, limit, category, aiAvailable }: { analysisId: string; initial: Entry[]; limit: number; category: string; aiAvailable: boolean }) {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const remaining = Math.max(0, limit - entries.length);

  async function ask(question: string) {
    if (question.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/analyses/${analysisId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message ?? "Fehler");
      setEntries((e) => [...e, d.entry]);
      setQ("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="s-assistant" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <MessageCircleQuestion className="size-4 text-accent" /> Frag zum Bericht
        </p>
        <span className="text-xs text-muted">{remaining} von {limit} Fragen übrig</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">Antworten stützen sich nur auf diesen Bericht. Fehlt etwas, sagen wir es offen.</p>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-3">
          {entries.map((e) => (
            <li key={e.at} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-accent-fg">{e.q}</p>
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">{e.a}</p>
                {!e.grounded && <p className="mt-1 text-[11px] text-warn">Diese Information steht nicht im Bericht.</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!aiAvailable ? (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Rückfragen sind verfügbar, sobald die KI aktiviert ist.</p>
      ) : remaining > 0 ? (
        <>
          {entries.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(SUGGESTIONS[category] ?? SUGGESTIONS.default).map((s) => (
                <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="z. B. Was kostet die Reparatur?" className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 outline-none focus:border-ring" aria-label="Frage" />
            <Button type="submit" size="icon" className="size-11" disabled={busy || q.trim().length < 3} aria-label="Frage senden">
              {busy ? <Spinner /> : <Send />}
            </Button>
          </form>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Alle Rückfragen für diesen Kaufcheck sind genutzt.</p>
      )}
    </section>
  );
}
