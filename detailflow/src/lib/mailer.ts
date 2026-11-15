import "server-only";

/**
 * E-Mail-Versand (vorbereitet). Aktiv nur mit RESEND_API_KEY und MAIL_FROM.
 * Ohne Konfiguration werden Nachrichten im Kundenportal angezeigt, aber nicht per E-Mail verschickt.
 */
export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(opts: { to: string; subject: string; text: string; replyTo?: string | null }) {
  if (!isMailConfigured()) return { ok: false as const, reason: "not_configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [opts.to], subject: opts.subject, text: opts.text, reply_to: opts.replyTo ?? undefined }),
  });
  return res.ok ? { ok: true as const } : { ok: false as const, reason: `http_${res.status}` };
}
