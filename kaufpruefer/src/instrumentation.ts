/**
 * Startet beim Serverstart den Intervall-Worker der persistenten Job-Queue.
 * Er nimmt Wiederholungen und nach einem Neustart liegengebliebene Jobs auf.
 * Abschaltbar mit JOB_WORKER=off (z. B. wenn nur ein Cron-Dienst arbeiten soll).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOB_WORKER === "off") return;
  const { startIntervalWorker } = await import("./lib/jobs/queue");
  startIntervalWorker(Number(process.env.JOB_WORKER_INTERVAL_SECONDS) || 20);
}
