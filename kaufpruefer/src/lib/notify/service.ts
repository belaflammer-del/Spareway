import "server-only";
import webpush from "web-push";
import { akteLimits } from "../akte/limits";
import { env } from "../config/env";
import { getStore } from "../store";
import type { NotificationRecord, WatchRecord } from "../store/akte-types";
import { newId, nowIso } from "../utils";

/**
 * Benachrichtigungen über alle verfügbaren Kanäle:
 * - In-App: immer (Tabelle notifications)
 * - E-Mail: nur wenn RESEND_API_KEY und EMAIL_FROM gesetzt sind
 * - Web Push: nur wenn VAPID-Schlüssel gesetzt sind und der Nutzer zugestimmt hat
 * - Native Push (APNs/FCM): vorbereitet über denselben Aufruf, noch nicht angebunden
 * Tageslimit je Nutzer verhindert Benachrichtigungsfluten.
 */

export const pushConfig = () => {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return pub && priv ? { publicKey: pub, privateKey: priv, subject: process.env.VAPID_SUBJECT?.trim() || "mailto:datenschutz@example.invalid" } : null;
};
export const emailConfig = () => {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return key && from ? { key, from } : null;
};

export async function notify(
  userId: string,
  n: Omit<NotificationRecord, "id" | "userId" | "createdAt">,
  channels: WatchRecord["notify"] = { inApp: true, email: false, push: false },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<{ delivered: string[]; skipped?: string }> {
  const store = getStore();
  const lim = akteLimits(await store.getConfig());
  const since = new Date(Date.now() - 864e5).toISOString();
  if ((await store.countNotificationsSince(userId, since)) >= lim.notificationsPerUserDay) return { delivered: [], skipped: "daily_limit" };

  const rec: NotificationRecord = { id: newId("ntf"), userId, createdAt: nowIso(), ...n };
  await store.addNotification(rec);
  const delivered = ["in_app"];
  const link = n.link ? new URL(n.link, env.appUrl).toString() : env.appUrl;

  const mail = emailConfig();
  if (channels.email && mail) {
    try {
      const user = await store.getUser(userId);
      if (user?.email) {
        const res = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${mail.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: mail.from,
            to: [user.email],
            subject: `DEAL-NIVO: ${n.title}`,
            text: `${n.body}\n\nZur Kaufakte: ${link}\n\nDu erhältst diese E-Mail, weil du die Beobachtung für dieses Angebot aktiviert hast. Abbestellen: in der Kaufakte unter „Angebot beobachten“.`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) delivered.push("email");
      }
    } catch (e) {
      console.warn("[notify] E-Mail fehlgeschlagen:", (e as Error).message);
    }
  }

  const push = pushConfig();
  if (channels.push && push) {
    webpush.setVapidDetails(push.subject, push.publicKey, push.privateKey);
    for (const sub of await store.listPushSubscriptions(userId)) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: n.title, body: n.body, url: n.link ?? "/" }), { TTL: 3600 * 24 });
        if (!delivered.includes("push")) delivered.push("push");
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await store.deletePushSubscription(sub.endpoint); // abgelaufenes Abo
      }
    }
  }
  return { delivered };
}
