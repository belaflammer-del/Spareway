import "server-only";
import { resolvePricing, type PricingConfig } from "../config/pricing";
import { getStore } from "../store";

export async function getPricing(): Promise<PricingConfig> {
  return resolvePricing(await getStore().getConfig());
}

/**
 * Führt eine kostenpflichtige Aktion mit Token-Reservierung aus:
 * reservieren → ausführen → bei Erfolg verbuchen, bei Fehler freigeben.
 * So führt eine fehlgeschlagene Analyse nie zu einem Tokenverlust.
 */
export async function withTokenReservation<T>(
  userId: string,
  analysisId: string,
  amount: number,
  fn: (reservationId: string) => Promise<T>,
): Promise<T> {
  const store = getStore();
  const res = await store.reserveTokens(userId, analysisId, amount, `reserve:${analysisId}`);
  try {
    const result = await fn(res.id);
    await store.captureReservation(res.id);
    return result;
  } catch (e) {
    await store.releaseReservation(res.id, "Analyse fehlgeschlagen – Token zurückgebucht").catch(() => undefined);
    throw e;
  }
}
