import { describe, expect, it } from "vitest";
import { analyzeSeller, classifyComplaints, dedupeReviews, parsePastedReviews } from "@/lib/engine/seller";

describe("seller analysis", () => {
  it("removes duplicates from overlapping frames", () => {
    const raw = [
      { text: "Super Verkäufer, alles bestens, gerne wieder!" },
      { text: "Super Verkäufer, alles bestens, gerne wieder" },
      { text: "Ware nie angekommen, keine Antwort mehr." },
      { text: "Ware nie angekommen, keine Antwort mehr. Sehr ärgerlich." },
    ];
    const { unique, duplicates } = dedupeReviews(raw);
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(2);
    expect(unique[1].text).toContain("ärgerlich"); // längere Variante behalten
  });

  it("classifies complaint categories", () => {
    expect(classifyComplaints("Paket nie angekommen")).toContain("not_received");
    expect(classifyComplaints("Das ist ein Fake")).toContain("counterfeit_suspicion");
    expect(classifyComplaints("Antwortet nicht")).toContain("communication");
  });

  it("parses pasted reviews with explicit markers", () => {
    const r = parsePastedReviews("Positiv: Schnelle Lieferung\n\nNegativ: Artikel nicht wie beschrieben\n\nNeutral: ok");
    expect(r.map((x) => x.sentiment)).toEqual(["positive", "negative", "neutral"]);
  });

  it("reports honest coverage and never claims completeness", () => {
    const a = analyzeSeller({ raw: [{ text: "Top!", sentiment: "positive" }], inputMethod: "screenshots", platformTotalClaimed: 120 });
    expect(a.visibleReviewCount).toBe(1);
    expect(a.coverageNote).toContain("1 von 120");
    expect(a.disclaimer).toMatch(/nicht überprüft/);
  });

  it("does not count complaints from positive reviews", () => {
    const a = analyzeSeller({ raw: [{ text: "Versand war schnell, super", sentiment: "positive" }], inputMethod: "pasted_text" });
    expect(a.complaints).toHaveLength(0);
  });
});
