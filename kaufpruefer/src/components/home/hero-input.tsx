"use client";

import { ArrowRight, ClipboardPaste, ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { extractListingLink } from "@/lib/import/share-text";

export function HeroInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(text: string) {
    const v = text.trim();
    if (!v) return setError("Füge den Link zum Inserat ein.");
    // Akzeptiert auch den kompletten Teilen-Text aus Kleinanzeigen, mobile.de, eBay …
    if (!extractListingLink(v).url) return setError("Kein Link gefunden. Tippe in der App auf „Teilen“ → „Kopieren“ und füge es hier ein.");
    router.push(`/check?url=${encodeURIComponent(v.slice(0, 2000))}`);
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      setValue(t);
      setError(null);
      if (extractListingLink(t).url) go(t);
    } catch {
      setError("Einfügen nicht erlaubt – halte lange ins Feld und tippe auf „Einsetzen“.");
    }
  }

  return (
    <div className="w-full max-w-xl md:mx-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="rounded-2xl border border-border bg-surface p-2 shadow-card focus-within:border-accent"
      >
        <label htmlFor="hero-url" className="sr-only">Inseratslink</label>
        <div className="flex items-center gap-2">
          <input
            id="hero-url"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Link zum Inserat einfügen"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className="h-12 min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted/80"
          />
          <button type="button" onClick={paste} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-medium active:scale-95">
            <ClipboardPaste className="size-4" /> Einfügen
          </button>
        </div>
        <Button type="submit" size="lg" className="mt-2 h-12 w-full">
          Jetzt prüfen <ArrowRight />
        </Button>
      </form>
      <p className={`mt-2.5 min-h-5 text-sm md:text-center ${error ? "text-bad" : "text-muted"}`} aria-live="polite">
        {error ?? "Kleinanzeigen · mobile.de · AutoScout24 · eBay · Vinted"}
      </p>
      <button type="button" onClick={() => router.push("/check?mode=screenshots")} className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground md:mx-auto">
        <ImageUp className="size-4" /> oder Screenshots hochladen
      </button>
    </div>
  );
}
