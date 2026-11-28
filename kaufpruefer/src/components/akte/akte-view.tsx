"use client";

import {
  ArrowRight,
  Calculator,
  ClipboardCheck,
  Download,
  Eye,
  FileWarning,
  Images,
  MessagesSquare,
  ScanSearch,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { CHAT_CATEGORY_LABELS, LEVEL_LABELS, LEVEL_TONE, MATCH_LABELS } from "@/lib/akte/labels";
import { CHAT_CATEGORIES } from "@/lib/akte/schemas";
import type { AkteViewModel } from "@/lib/akte/view-model";
import { postJson } from "@/lib/client/jobs";
import { RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { CostsCard } from "./costs-card";
import { OutcomeCard } from "./outcome-card";
import { WatchCard } from "./watch-card";

function Card({ id, icon: Icon, title, badge, children }: { id: string; icon: typeof Eye; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Icon className="size-4" />
        </span>
        <h3 className="flex-1 font-semibold">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

const REC_TONE = { interesting: "good", inspect_further: "warn", elevated_risk: "bad", missing_info: "neutral" } as const;

export function AkteView({ vm }: { vm: AkteViewModel }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/analysis/${vm.analysisId}`;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const computeCosts = () => run("costs", () => postJson(`/api/analyses/${vm.analysisId}/costs`, {}), "Gesamtkosten berechnet");
  const matchImages = () => run("images", () => postJson(`/api/analyses/${vm.analysisId}/images`), "Bildabgleich abgeschlossen");

  const step = vm.nextStep;
  const stepAction: Record<typeof step.id, React.ReactNode> = {
    seller: <Button size="sm" onClick={() => scrollTo("s-seller")}>Prüfen</Button>,
    chat: (
      <Button asChild size="sm">
        <Link href={`${base}/chat`}>Chat hochladen</Link>
      </Button>
    ),
    inspection: (
      <Button asChild size="sm">
        <Link href={`${base}/besichtigung`}>Starten</Link>
      </Button>
    ),
    inspection_continue: (
      <Button asChild size="sm">
        <Link href={`${base}/besichtigung`}>Fortsetzen</Link>
      </Button>
    ),
    costs: <Button size="sm" onClick={computeCosts} disabled={!!busy}>{busy === "costs" ? <Spinner /> : "Berechnen"}</Button>,
    images: <Button size="sm" onClick={matchImages} disabled={!!busy}>{busy === "images" ? <Spinner /> : "Vergleichen"}</Button>,
    watch: <Button size="sm" onClick={() => scrollTo("s-watch")}>Einrichten</Button>,
    export: (
      <Button asChild size="sm">
        <a href={`/api/analyses/${vm.analysisId}/akte`}>Exportieren</a>
      </Button>
    ),
  };

  const changed = vm.recommendation.current !== vm.baseRecommendation;
  const lastChat = vm.chats.at(-1)?.data;
  const insp = vm.inspection?.data;
  const done = insp ? insp.items.filter((i) => i.status !== "unchecked").length : 0;

  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-sm font-semibold text-muted">Deine Kaufakte</h2>

      {changed && (
        <div className={cn("rounded-2xl border p-4", vm.recommendation.current === "elevated_risk" ? "border-bad/40 bg-bad-soft/40" : "border-warn/40 bg-warn-soft/40")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Aktualisierte Einschätzung · {vm.recommendation.source}</p>
          <p className="mt-1 font-bold">{RECOMMENDATION_LABELS[vm.recommendation.current]}</p>
          <p className="text-sm text-muted">Vorher: {RECOMMENDATION_LABELS[vm.baseRecommendation]}</p>
        </div>
      )}

      {/* Nächster sinnvoller Schritt */}
      <div className="flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent-soft/40 p-4">
        <ArrowRight className="size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{step.title}</p>
          <p className="text-sm text-muted">{step.text}</p>
        </div>
        {stepAction[step.id]}
      </div>

      {vm.activeJobs.length > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          <Spinner /> {vm.activeJobs[0].message ?? "Wird verarbeitet …"} ({vm.activeJobs[0].progress} %) – <button className="underline" onClick={() => router.refresh()}>aktualisieren</button>
        </p>
      )}

      {/* Aktionen */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Users, label: "Verkäufer prüfen", onClick: () => scrollTo("s-seller") },
          { icon: MessagesSquare, label: "Chat analysieren", href: `${base}/chat` },
          { icon: ClipboardCheck, label: insp?.state === "in_progress" ? "Besichtigung fortsetzen" : "Besichtigung starten", href: `${base}/besichtigung` },
          { icon: Eye, label: vm.watch ? "Beobachtung" : "Angebot beobachten", onClick: () => scrollTo("s-watch") },
          { icon: Calculator, label: "Gesamtkosten", onClick: vm.costs ? () => scrollTo("s-costs") : computeCosts },
          { icon: Images, label: "Bilder vergleichen", onClick: vm.imageMatch ? () => scrollTo("s-images") : matchImages, disabled: !vm.hasPhotos },
          { icon: Download, label: "Kaufakte exportieren", href: `/api/analyses/${vm.analysisId}/akte`, download: true },
        ].map((a) => {
          const cls = "flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm font-medium transition active:scale-[0.98] hover:border-accent/50 disabled:opacity-50";
          const inner = (
            <>
              <a.icon className="size-4 shrink-0 text-accent" /> <span className="min-w-0 leading-tight">{a.label}</span>
            </>
          );
          if (a.href) return a.download ? <a key={a.label} href={a.href} className={cls}>{inner}</a> : <Link key={a.label} href={a.href} className={cls}>{inner}</Link>;
          return <button key={a.label} onClick={a.onClick} disabled={a.disabled || !!busy} className={cls}>{inner}</button>;
        })}
      </div>

      {/* Verkäuferchat */}
      <Card
        id="s-chat"
        icon={MessagesSquare}
        title="Verkäuferchat"
        badge={lastChat ? <Badge tone={lastChat.updatedRecommendation.current === "elevated_risk" ? "bad" : lastChat.signals.length + lastChat.contradictions.length ? "warn" : "good"}>{vm.chats.length} Prüfung{vm.chats.length > 1 ? "en" : ""}</Badge> : undefined}
      >
        {lastChat ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              {CHAT_CATEGORIES.map((c) => {
                const v = lastChat.categories[c];
                return (
                  <div key={c} className="flex items-center justify-between gap-2">
                    <span>{CHAT_CATEGORY_LABELS[c]}</span>
                    <Badge tone={LEVEL_TONE[v.level]}>{LEVEL_LABELS[v.level]}</Badge>
                  </div>
                );
              })}
            </div>
            {lastChat.contradictions.slice(0, 2).map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="mb-2 flex items-center gap-1.5 font-semibold">
                  <FileWarning className="size-4 text-bad" /> {c.kind === "documented" ? "Belegter Widerspruch" : "Möglicher Widerspruch"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="text-[11px] font-semibold uppercase text-muted">Inserat</p>
                    <p>„{c.listingStatement}“</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="text-[11px] font-semibold uppercase text-muted">Chat</p>
                    <p>„{c.chatStatement}“</p>
                  </div>
                </div>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`${base}/chat`}>Details, Antwortvorschlag & neue Prüfung</Link>
            </Button>
          </div>
        ) : (
          <div className="text-sm">
            <p className="text-muted">Lade Screenshots, eine Bildschirmaufnahme oder den Text deines Chats hoch. Wir prüfen auf Widersprüche zum Inserat und typische Warnsignale – Telefonnummern und Adressen werden geschwärzt.</p>
            <Button asChild size="sm" className="mt-3">
              <Link href={`${base}/chat`}>Verkäuferchat überprüfen</Link>
            </Button>
          </div>
        )}
      </Card>

      {/* Besichtigung */}
      <Card id="s-inspection" icon={ClipboardCheck} title="Besichtigung" badge={insp ? <Badge tone={insp.state === "finished" ? "good" : "warn"}>{insp.state === "finished" ? "Abgeschlossen" : `${done}/${insp.items.length}`}</Badge> : undefined}>
        {insp?.report ? (
          <div className="text-sm">
            <p className={cn("font-semibold", insp.report.risk === "high" && "text-bad", insp.report.risk === "medium" && "text-warn", insp.report.risk === "low" && "text-good")}>{insp.report.riskText}</p>
            <p className="mt-1 text-muted">
              {insp.report.ok} in Ordnung · {insp.report.conspicuous} auffällig · {insp.report.unchecked} nicht geprüft
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link href={`${base}/besichtigung`}>Bericht ansehen</Link>
            </Button>
          </div>
        ) : (
          <div className="text-sm">
            <p className="text-muted">Individuelle Prüfliste für {vm.category === "vehicle" ? "dieses Fahrzeug" : "dieses Produkt"} – mit Fotos, Notizen und Abschlussbericht. Funktioniert auch bei schlechtem Empfang.</p>
            <Button asChild size="sm" className="mt-3">
              <Link href={`${base}/besichtigung`}>{insp ? "Besichtigung fortsetzen" : "Besichtigung starten"}</Link>
            </Button>
          </div>
        )}
      </Card>

      <CostsCard analysisId={vm.analysisId} costs={vm.costs} onCompute={computeCosts} busy={busy === "costs"} />

      <WatchCard vm={vm} />

      <OutcomeCard vm={vm} />

      {/* Bildabgleich */}
      <Card id="s-images" icon={ScanSearch} title="Bildabgleich" badge={vm.imageMatch ? <Badge tone={vm.imageMatch.summary === "none" ? "good" : vm.imageMatch.summary === "possible" ? "info" : "warn"}>{MATCH_LABELS[vm.imageMatch.summary].split(" ")[0]}</Badge> : undefined}>
        {vm.imageMatch ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">{vm.imageMatch.matches.length ? `${vm.imageMatch.matches.length} ähnliche${vm.imageMatch.matches.length > 1 ? "" : "s"} Bild${vm.imageMatch.matches.length > 1 ? "er" : ""} in anderen Angeboten` : MATCH_LABELS.none}</p>
            {vm.imageMatch.withinListing.length > 0 && <p className="text-muted">Im Inserat selbst wurden {vm.imageMatch.withinListing.length} doppelte Fotos erkannt.</p>}
            {vm.imageMatch.matches.slice(0, 4).map((m, i) => (
              <div key={i} className="flex items-start justify-between gap-2 rounded-xl bg-surface-2 p-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{MATCH_LABELS[m.class]} · Foto {m.imageIndex + 1}</p>
                  <p className="text-xs text-muted">
                    {m.source} · erfasst {new Date(m.capturedAt).toLocaleDateString("de-DE")}
                    {m.ownAnalysisId && (
                      <>
                        {" · "}
                        <Link className="underline" href={`/analysis/${m.ownAnalysisId}`}>deine Kaufakte</Link>
                      </>
                    )}
                    {m.listingUrl && /^https:\/\//.test(m.listingUrl) && (
                      <>
                        {" · "}
                        <a className="underline" href={m.listingUrl} target="_blank" rel="noopener noreferrer nofollow">Angebot</a>
                      </>
                    )}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">{m.similarityPct} %</span>
              </div>
            ))}
            <p className="text-xs text-muted">{vm.imageMatch.transparency}</p>
            <p className="text-xs text-muted">{vm.imageMatch.caveat}</p>
            <Button variant="outline" size="sm" className="w-full" onClick={matchImages} disabled={!!busy}>
              {busy === "images" ? <Spinner /> : "Erneut vergleichen"}
            </Button>
          </div>
        ) : (
          <div className="text-sm">
            <p className="text-muted">{vm.hasPhotos ? "Prüft, ob die Inseratsfotos bereits in anderen, in DEAL-NIVO geprüften Angeboten vorkommen." : "Für den Bildabgleich werden Produktfotos benötigt."}</p>
            {vm.hasPhotos && (
              <Button size="sm" className="mt-3" onClick={matchImages} disabled={!!busy}>
                {busy === "images" ? <Spinner /> : "Bilder vergleichen"}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
