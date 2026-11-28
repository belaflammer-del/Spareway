import { expect, it } from "vitest";
import { extractListingLink } from "@/lib/import/share-text";

it("ignoriert den Kleinanzeigen-Werbetext „Gerade bei #Kleinanzeigen“", () => {
  for (const t of [
    "Gerade bei #Kleinanzeigen https://www.kleinanzeigen.de/s-anzeige/gilera-runner-fx/2871234567-305-1234",
    "Gerade bei #Kleinanzeigen gefunden: https://www.kleinanzeigen.de/s-anzeige/gilera-runner-fx/2871234567-305-1234",
  ]) {
    const r = extractListingLink(t);
    expect(r.url).toContain("kleinanzeigen.de/s-anzeige/");
    expect(r.titleHint).toBeUndefined();
  }
  expect(extractListingLink("Gerade bei #Kleinanzeigen: Gilera Runner FX 183ccm https://www.kleinanzeigen.de/s-anzeige/x/123").titleHint).toBe("Gilera Runner FX 183ccm");
});
