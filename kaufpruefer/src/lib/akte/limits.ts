import type { AppConfig } from "../store/types";

/** Kostenkontrolle der V4-Funktionen – alle Werte im Admin-Bereich änderbar. */
export function akteLimits(cfg: AppConfig) {
  const l = cfg.limits ?? {};
  const r = cfg.retention ?? {};
  return {
    chatChecksPerAnalysis: l.chatChecksPerAnalysis ?? 3,
    chatScreenshotsMax: l.chatScreenshotsMax ?? 10,
    chatFramesMax: 20,
    inspectionPhotosMax: l.inspectionPhotosMax ?? 30,
    inspectionPhotoAiMax: l.inspectionPhotoAiMax ?? 8,
    imageMatchPerAnalysis: l.imageMatchPerAnalysis ?? 5,
    watchesPerUser: l.watchesPerUser ?? 10,
    watchMinIntervalHours: Math.max(1, l.watchMinIntervalHours ?? 24),
    watchManualUpdatesPerDay: l.watchManualUpdatesPerDay ?? 5,
    notificationsPerUserDay: l.notificationsPerUserDay ?? 20,
    retention: {
      chatDays: r.chatDays ?? 30,
      inspectionDays: r.inspectionDays ?? 180,
      imageHashDays: r.imageHashDays ?? 180,
      snapshotDays: r.snapshotDays ?? 365,
    },
  };
}
export type AkteLimits = ReturnType<typeof akteLimits>;

export const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
