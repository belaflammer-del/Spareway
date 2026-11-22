# Wissensdatenbank für Schwachstellen

Datei: `src/lib/knowledge/weaknesses.ts` – wird **leer ausgeliefert**, damit keine ungeprüften Angaben als Fakten erscheinen.

## Regeln für Einträge

- Jede Aussage gilt nur für eine konkrete Variante: Marke + Modell-Regex + optional Motor/Variante-Regex + Baujahresbereich.
- Pflicht: überprüfbare Quelle (`sourceUrl`, `sourceLabel`), `reviewedAt`, `verified: true` erst nach redaktioneller Prüfung.
- Keine pauschalen Reparaturkosten ohne Quelle.
- Ohne Baujahr im Inserat werden baujahresabhängige Einträge nicht ausgespielt.

## Beispiel

```ts
{
  id: "bmw-n47-steuerkette",
  category: "vehicle",
  brand: "BMW",
  modelPattern: "^(1er|3er|320d|318d|…)",
  variantPattern: "N47",
  yearFrom: 2007, yearTo: 2011,
  title: "Steuerkette prüfen",
  detail: "…",
  appliesTo: "N47-Dieselmotoren, Baujahre …",
  severity: "high",
  checkAdvice: "Kaltstart auf Rasselgeräusche prüfen; Nachweis über Tausch anfragen",
  sourceUrl: "https://…", sourceLabel: "…", reviewedAt: "2026-11-20", verified: true,
}
```

(Werte im Beispiel sind Platzhalter und vor Verwendung zu recherchieren.)

## Ausbau

Später in eine Datenbanktabelle mit Admin-Pflege und Vektorsuche (pgvector) überführen; `retrieveKnowledge` ist bereits die einzige Zugriffsstelle.
