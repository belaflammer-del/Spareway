/**
 * Startet beim Serverstart die Hintergrundverarbeitung:
 * - Intervall-Worker der persistenten Job-Queue (Wiederholungen, liegengebliebene Jobs)
 * - alle 10 Minuten: fällige Angebotsbeobachtungen einreihen und Löschfristen durchsetzen
 * Abschaltbar mit JOB_WORKER=off (z. B. wenn ausschließlich /api/cron/jobs arbeiten soll).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOB_WORKER === "off") return;
  const { startIntervalWorker } = await import("./lib/jobs/queue");
  startIntervalWorker(Number(process.env.JOB_WORKER_INTERVAL_SECONDS) || 20);
  const housekeeping = async () => {
    try {
      const [{ scheduleDueWatches, processWatchLifecycle }, { getStore }] = await Promise.all([import("./lib/watch/service"), import("./lib/store")]);
      await processWatchLifecycle();
      await scheduleDueWatches();
      const now = new Date().toISOString();
      await getStore().deleteExpiredModules(now);
      await getStore().deleteExpiredImageHashes(now);
    } catch (e) {
      console.warn("[housekeeping]", String((e as Error).message).slice(0, 200));
    }
  };
  setTimeout(housekeeping, 30_000).unref?.();
  setInterval(housekeeping, 10 * 60_000).unref?.();
}
