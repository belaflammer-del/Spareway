import { describe, expect, it } from "vitest";
import { addDays, berlinDay, berlinLocalToISO, berlinParts, isoToBerlinLocal, weekStart } from "@/lib/time";

describe("Zeitzone Europe/Berlin", () => {
  it("rechnet Winterzeit (UTC+1) korrekt um", () => {
    expect(berlinLocalToISO("2026-12-01T09:30")).toBe("2026-12-01T08:30:00.000Z");
  });
  it("rechnet Sommerzeit (UTC+2) korrekt um", () => {
    expect(berlinLocalToISO("2026-07-15T14:00")).toBe("2026-07-15T12:00:00.000Z");
  });
  it("ist auf Umstellungstagen korrekt", () => {
    expect(berlinLocalToISO("2026-03-29T12:00")).toBe("2026-03-29T10:00:00.000Z");
    expect(berlinLocalToISO("2026-10-25T12:00")).toBe("2026-10-25T11:00:00.000Z");
  });
  it("Hin- und Rückweg ergeben denselben Wert", () => {
    expect(isoToBerlinLocal(berlinLocalToISO("2026-11-15T07:45"))).toBe("2026-11-15T07:45");
  });
  it("ordnet späte UTC-Zeiten dem richtigen Berliner Tag zu", () => {
    expect(berlinDay("2026-11-15T23:30:00Z")).toBe("2026-11-16");
    expect(berlinParts("2026-11-15T23:30:00Z").hour).toBe(0);
  });
  it("berechnet Wochenanfang (Montag) und Tagesarithmetik", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sonntag -> Montag davor
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("lehnt ungültige Eingaben ab", () => {
    expect(berlinLocalToISO("gestern")).toBeNull();
    expect(berlinLocalToISO("")).toBeNull();
  });
});
