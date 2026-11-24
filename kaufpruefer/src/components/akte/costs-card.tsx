"use client";

import { Calculator, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import type { CostAnalysisData, CostLine, UserCostInput } from "@/lib/akte/schemas";
import { postJson } from "@/lib/client/jobs";
import { COST_ITEMS } from "@/lib/costs/table";
import { formatEur } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const KIND = {
  documented: { label: "Belegte Zusatzkosten", tone: "info" as const },
  estimated: { label: "Geschätzte Zusatzkosten", tone: "warn" as const },
  risk: { label: "Mögliche Risiken (separates Szenario)", tone: "bad" as const },
};

function amount(l: CostLine) {
  if (l.amountUnknown) return "Betrag unbekannt";
  return l.lowEur === l.highEur ? formatEur(l.lowEur) : `${formatEur(l.lowEur)} – ${formatEur(l.highEur)}`;
}

export function CostsCard({ analysisId, costs, onCompute, busy }: { analysisId: string; costs: CostAnalysisData | null; onCompute: () => void; busy: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", item: "repair_other", low: "", high: "", kind: "documented" as UserCostInput["kind"] });

  async function save(inputs: UserCostInput[]) {
    setSaving(true);
    try {
      await postJson(`/api/analyses/${analysisId}/costs`, { userInputs: inputs });
      router.refresh();
      setAdding(false);
      setForm({ label: "", item: "repair_other", low: "", high: "", kind: "documented" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function addInput() {
    const low = Number(form.low.replace(/\./g, "").replace(",", "."));
    const high = form.high ? Number(form.high.replace(/\./g, "").replace(",", ".")) : low;
    if (!form.label.trim() || !Number.isFinite(low) || low < 0 || !Number.isFinite(high)) return toast.error("Bitte Bezeichnung und Betrag angeben.");
    void save([...(costs?.userInputs ?? []), { id: `${Date.now()}`, item: form.item, label: form.label.trim().slice(0, 120), lowEur: low, highEur: high, kind: form.kind }]);
  }

  const t = costs?.totals;
  return (
    <section id="s-costs" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Calculator className="size-4" />
        </span>
        <h3 className="flex-1 font-semibold">Was kostet mich dieser Kauf wirklich?</h3>
        {costs && <Badge tone={costs.dataQuality.score >= 80 ? "good" : costs.dataQuality.score >= 50 ? "warn" : "neutral"}>Daten {costs.dataQuality.label}</Badge>}
      </div>
      {!costs ? (
        <div className="text-sm">
          <p className="text-muted">Kaufpreis plus belegte und wahrscheinliche Zusatzkosten – getrennt von möglichen Risiken. Ohne belegte Quelle nennen wir keinen Betrag.</p>
          <Button size="sm" className="mt-3" onClick={onCompute} disabled={busy}>
            {busy ? <Spinner /> : "Gesamtkosten berechnen"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {costs.usesDemoTable && <p className="rounded-lg bg-demo-soft px-3 py-2 text-xs text-demo">Demo: fiktive Richtwerte.</p>}
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex justify-between">
              <span>Angebotspreis</span>
              <span className="tabular font-semibold">{formatEur(costs.offerPriceEur)}</span>
            </div>
            {t?.expectedLow != null && (
              <div className="mt-1 flex justify-between text-base">
                <span className="font-semibold">Erwartete Gesamtkosten</span>
                <span className="tabular font-bold">{t.expectedLow === t.expectedHigh ? formatEur(t.expectedLow) : `${formatEur(t.expectedLow)} – ${formatEur(t.expectedHigh)}`}</span>
              </div>
            )}
            {t && t.riskHigh > 0 && t.withRiskHigh != null && (
              <div className="mt-1 flex justify-between text-muted">
                <span>Mit bezifferten Risiken (Szenario)</span>
                <span className="tabular">bis {formatEur(t.withRiskHigh)}</span>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{costs.dataQuality.note}</p>
          </div>

          {(["documented", "estimated", "risk"] as const).map((k) => {
            const lines = costs.lines.filter((l) => l.kind === k);
            if (!lines.length) return null;
            return (
              <div key={k}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{KIND[k].label}</p>
                <ul className="space-y-1.5">
                  {lines.map((l) => {
                    const user = costs.userInputs.find((u) => `user-${u.id}` === l.id);
                    return (
                      <li key={l.id} className="rounded-lg border border-border p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">
                            {l.label}
                            {l.optional && <span className="font-normal text-muted"> (optional)</span>}
                          </span>
                          <span className={cn("tabular shrink-0", l.amountUnknown && "text-muted")}>{amount(l)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {l.reason} · Quelle: {l.source}
                          {l.sourceDate ? ` (Stand ${new Date(l.sourceDate).toLocaleDateString("de-DE")})` : ""}
                        </p>
                        {user && (
                          <button className="mt-1 flex items-center gap-1 text-xs text-bad" onClick={() => save(costs.userInputs.filter((u) => u.id !== user.id))} disabled={saving}>
                            <Trash2 className="size-3" /> Entfernen
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {adding ? (
            <div className="space-y-2 rounded-xl border border-dashed border-accent/50 p-3">
              <Input placeholder="z. B. Inspektion laut Kostenvoranschlag" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
                  {Object.entries(COST_ITEMS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as UserCostInput["kind"] })}>
                  <option value="documented">Beleg / Kostenvoranschlag</option>
                  <option value="estimated">Eigene Schätzung</option>
                </Select>
                <Input inputMode="decimal" placeholder="Betrag (von) €" value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} />
                <Input inputMode="decimal" placeholder="bis € (optional)" value={form.high} onChange={(e) => setForm({ ...form, high: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addInput} disabled={saving}>{saving ? <Spinner /> : "Hinzufügen"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Abbrechen</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus /> Eigene Kosten
              </Button>
              <Button size="sm" variant="ghost" onClick={onCompute} disabled={busy}>
                {busy ? <Spinner /> : "Neu berechnen"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted">{costs.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
