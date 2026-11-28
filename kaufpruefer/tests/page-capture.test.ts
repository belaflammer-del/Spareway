import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { parsePageCapture, parsePrice, parseRegistration, PageCaptureSchema } from "@/lib/share/page-capture";
import { LocalStore } from "@/lib/store/local";

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kkp-")), "db.json"));
  (globalThis as unknown as { __kkStore: LocalStore }).__kkStore = store;
});

const gilera = PageCaptureSchema.parse({
  v: 1,
  url: "https://www.kleinanzeigen.de/s-anzeige/gilera-runner-fx-183ccm-2t/2871234567-305-1234?utm_source=sharesheet",
  title: "Gilera Runner FX 183ccm 2T Full Custom | Malossi | Einzelstück",
  price: "5.800 € VB",
  description: "Verkaufe meinen komplett aufgebauten Gilera Runner FX 2-Takt. Originale Board Mappe, tüv Berichte der letzten Jahre.",
  location: "53819 Neunkirchen-Seelscheid",
  details: [
    ["Art", "Motorroller & Scooter"],
    ["Marke", "Piaggio"],
    ["Kilometerstand", "14.350 km"],
    ["Erstzulassung", "Oktober 1998"],
    ["Leistung", "24 PS"],
  ],
  images: ["https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/bb?rule=$_59.JPG", "https://evil.example/x.jpg"],
});

describe("„→ DEAL-NIVO“-Button: Seitenübernahme", () => {
  it("liest ein Kleinanzeigen-Inserat vollständig ohne KI", () => {
    const r = parsePageCapture(gilera);
    const l = r.listing;
    expect(l.platform).toBe("kleinanzeigen");
    expect(l.externalId).toBe("2871234567");
    expect(l.title).toContain("Gilera Runner FX");
    expect(l.priceEur).toBe(5800);
    expect(l.mileageKm).toBe(14350);
    expect(l.year).toBe(1998);
    expect(l.firstRegistration).toBe("10/1998");
    expect(l.powerKw).toBe(18);
    expect(l.brand).toBe("Piaggio");
    expect(l.category).toBe("vehicle");
    expect(l.location).toContain("Neunkirchen");
    expect(r.notes.join(" ")).toMatch(/VB/);
    expect(r.fieldsFound).toBeGreaterThanOrEqual(5);
  });

  it("liest strukturierte Daten (JSON-LD) z. B. von mobile.de", () => {
    const c = PageCaptureSchema.parse({
      v: 1,
      url: "https://suchen.mobile.de/fahrzeuge/details.html?id=412345678",
      title: "",
      jsonLd: [JSON.stringify({ "@context": "https://schema.org", "@type": "Car", name: "BMW 320d Touring", brand: { "@type": "Brand", name: "BMW" }, model: "320d", mileageFromOdometer: { "@type": "QuantitativeValue", value: "125000", unitCode: "KMT" }, vehicleModelDate: "2020", fuelType: "Diesel", offers: { "@type": "Offer", price: "18500", priceCurrency: "EUR" } })],
      meta: { "og:title": "BMW 320d Touring | mobile.de" },
    });
    const l = parsePageCapture(c).listing;
    expect(l.platform).toBe("mobile_de");
    expect(l.title).toBe("BMW 320d Touring");
    expect(l.priceEur).toBe(18500);
    expect(l.mileageKm).toBe(125000);
    expect(l.year).toBe(2020);
    expect(l.brand).toBe("BMW");
    expect(l.fuel).toBe("Diesel");
  });

  it("Preise, Zulassung und Sonderfälle", () => {
    expect(parsePrice("VB 12.450 €")).toEqual({ priceEur: 12450, negotiable: true });
    expect(parsePrice("18.900,00 EUR").priceEur).toBe(18900);
    expect(parsePrice("Zu verschenken").priceEur).toBe(0);
    expect(parsePrice("Preis auf Anfrage").priceEur).toBeUndefined();
    expect(parseRegistration("03/2017")).toEqual({ year: 2017, firstRegistration: "03/2017" });
  });

  it("übernimmt nur Bilder der Plattform-Bildserver, nie fremde Adressen", async () => {
    const { importPageCapture } = await import("@/lib/share/page-import");
    const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#4a6" } }).jpeg().toBuffer();
    const fetched: string[] = [];
    const fake = (async (u: string) => {
      fetched.push(u);
      return new Response(new Uint8Array(jpg), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const r = await importPageCapture("u1", gilera, { fetchImpl: fake, resolver: async () => ["93.184.216.34"] });
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("img.kleinanzeigen.de");
    expect(r.draft.listing.images).toHaveLength(1);
    expect(r.draft.listing.provenance.priceEur).toBe("page");
    expect(r.draft.listing.priceEur).toBe(5800);
    expect(r.draft.missingInfo.length).toBeGreaterThanOrEqual(0);
  });

  it("lehnt manipulierte Übergaben ab", () => {
    expect(PageCaptureSchema.safeParse({ v: 1, url: "x", details: Array.from({ length: 200 }, () => ["a", "b"]) }).success).toBe(false);
    expect(PageCaptureSchema.safeParse({ v: 2, url: "x" }).success).toBe(false);
  });
});
