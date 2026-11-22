"use client";

import { ArrowRight, ImageUp, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function HeroInput() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) return setError("Bitte füge einen Inseratslink ein.");
    if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return setError("Das sieht nicht nach einem gültigen Link aus.");
    router.push(`/check?url=${encodeURIComponent(v)}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={submit} className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card transition focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/10 sm:flex-row sm:items-center">
        <label htmlFor="hero-url" className="sr-only">Inseratslink</label>
        <div className="flex flex-1 items-center gap-2.5 px-3">
          <Link2 className="size-5 shrink-0 text-muted" aria-hidden />
          <input
            id="hero-url"
            inputMode="url"
            autoComplete="off"
            placeholder="Inseratslink hier einfügen"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted/80"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-xl">
          Jetzt prüfen <ArrowRight />
        </Button>
      </form>
      <div className="mt-3 flex flex-col items-center justify-between gap-2 px-1 text-sm sm:flex-row">
        <p className={error ? "text-bad" : "text-muted"} aria-live="polite">
          {error ?? "mobile.de, AutoScout24, Kleinanzeigen, eBay, Vinted und weitere"}
        </p>
        <button type="button" onClick={() => router.push("/check?mode=screenshots")} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-accent">
          <ImageUp className="size-4" /> Screenshots hochladen
        </button>
      </div>
    </div>
  );
}
