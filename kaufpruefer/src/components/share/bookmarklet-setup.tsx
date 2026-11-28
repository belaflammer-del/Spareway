"use client";

import { Bookmark, Check, Copy, Laptop, MousePointerClick, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Device = "iphone" | "android" | "computer";

const STEPS: Record<Device, { setup: string[]; use: string[] }> = {
  iphone: {
    setup: [
      "Oben auf „Code kopieren“ tippen. Wichtig: Den Code NICHT in die Adressleiste einfügen – Safari führt ihn dort nicht aus.",
      "Diese Seite als Lesezeichen sichern: Teilen-Symbol (□↑) → „Lesezeichen hinzufügen“ → Name: DEAL-NIVO → Ort: Favoriten → Sichern.",
      "Buch-Symbol (Lesezeichen) → Reiter „Lesezeichen“ → „Favoriten“ → unten „Bearbeiten“ → auf „DEAL-NIVO“ tippen.",
      "Im zweiten Feld (Adresse) alles löschen und den kopierten Code einfügen → „Fertig“.",
    ],
    use: [
      "Inserat in Safari öffnen. Aus der Kleinanzeigen- oder eBay-App: Teilen → „In Safari öffnen“ (oder „Link kopieren“ und in Safari einfügen).",
      "Oben in die Adressleiste tippen – darunter erscheinen deine Favoriten. Auf „DEAL-NIVO“ tippen.",
      "DEAL-NIVO öffnet sich in einem neuen Tab mit Titel, Preis, Details und Bildern.",
    ],
  },
  android: {
    setup: [
      "Oben auf „Code kopieren“ tippen (nicht in die Adressleiste einfügen).",
      "In Chrome: Menü ⋮ → Stern ☆ (Lesezeichen) → „Bearbeiten“.",
      "Name: → DEAL-NIVO. Bei „URL“ alles löschen und den kopierten Code einfügen. Zurück.",
    ],
    use: [
      "Inserat in Chrome öffnen (aus der App: Teilen → Chrome).",
      "In die Adressleiste tippen, „DEAL“ schreiben und das Lesezeichen „→ DEAL-NIVO“ (mit Stern) auswählen.",
      "DEAL-NIVO öffnet sich mit allen Angaben.",
    ],
  },
  computer: {
    setup: ["Lesezeichenleiste einblenden (Strg+Umschalt+B bzw. ⌘+Umschalt+B).", "Den gelben Button „→ DEAL-NIVO“ mit der Maus in die Lesezeichenleiste ziehen."],
    use: ["Inserat öffnen.", "In der Lesezeichenleiste auf „→ DEAL-NIVO“ klicken."],
  },
};

export function BookmarkletSetup({ href }: { href: string }) {
  const [device, setDevice] = useState<Device>("iphone");
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // React blockiert javascript:-Adressen im href – daher direkt setzen (Ziehen in die Lesezeichenleiste)
    linkRef.current?.setAttribute("href", href);
    const ua = navigator.userAgent;
    setDevice(/iPhone|iPad/i.test(ua) ? "iphone" : /Android/i.test(ua) ? "android" : "computer");
  }, [href]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast.success("Code kopiert");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Kopieren nicht möglich – bitte das Feld unten markieren und kopieren.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
        <MousePointerClick className="size-3.5" /> Einmal einrichten, dann 1 Tipp pro Inserat
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Der „→ DEAL-NIVO“-Button</h1>
      <p className="mt-2 text-muted">
        Übergib Inserate von <b className="text-foreground">Kleinanzeigen, mobile.de, AutoScout24, eBay und Vinted</b> mit einem Tipp – Titel, Preis, Details, Beschreibung und Bilder werden automatisch übernommen. Keine Screenshots nötig.
      </p>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <a
          ref={linkRef}
          onClick={(e) => {
            e.preventDefault();
            toast.message("Diesen Button nicht anklicken, sondern als Lesezeichen speichern – siehe Anleitung.");
          }}
          className="inline-flex cursor-grab items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-bold text-accent-fg shadow-sm"
          title="In die Lesezeichenleiste ziehen"
        >
          <Bookmark className="size-4" /> → DEAL-NIVO
        </a>
        <Button variant="outline" onClick={copy} size="lg">
          {copied ? <Check /> : <Copy />} {copied ? "Kopiert" : "Code kopieren"}
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["iphone", "iPhone", Smartphone],
            ["android", "Android", Smartphone],
            ["computer", "Computer", Laptop],
          ] as const
        ).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setDevice(k)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm", device === k ? "bg-surface font-medium shadow-sm" : "text-muted")}>
            <Icon className="size-4" /> {l}
          </button>
        ))}
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Einrichten (einmalig)</h2>
        <ol className="mt-3 space-y-2.5">
          {STEPS[device].setup.map((s, i) => (
            <li key={s} className="flex gap-3 text-[15px] leading-snug">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Benutzen</h2>
        <ol className="mt-3 space-y-2.5">
          {STEPS[device].use.map((s, i) => (
            <li key={s} className="flex gap-3 text-[15px] leading-snug">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-surface p-5 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-good" /> Was der Button macht – und was nicht
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Er liest nur die Inseratsseite, die du gerade selbst geöffnet hast – wie Markieren und Kopieren.</li>
          <li>Er liest keine Passwörter, Cookies oder Nachrichten und funktioniert nur, wenn du ihn antippst.</li>
          <li>Die Daten werden direkt an DEAL-NIVO übergeben, nicht an Dritte.</li>
          <li>Auf Seiten, die er nicht kennt, übernimmt er nur Titel und Text – den Rest kannst du ergänzen.</li>
        </ul>
      </section>

      <details className="mt-3 rounded-2xl border border-border bg-surface p-5 text-sm">
        <summary className="cursor-pointer font-semibold">Code zum manuellen Kopieren</summary>
        <textarea readOnly value={href} onFocus={(e) => e.currentTarget.select()} className="mt-3 h-28 w-full rounded-xl border border-border bg-background p-2 font-mono text-[11px]" />
      </details>
    </div>
  );
}
