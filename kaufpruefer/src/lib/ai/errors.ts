/**
 * Übersetzt technische KI-Fehler in eine kurze, verständliche Ursache –
 * damit Betreiber und Nutzer sehen, WARUM etwas nicht geklappt hat.
 * Schlüssel werden nie ausgegeben.
 */
export function describeAiError(e: unknown, model?: string): { code: string; reason: string } {
  const err = e as { status?: number; code?: string; error?: { code?: string; type?: string }; message?: string; name?: string };
  const status = err.status;
  const code = err.code ?? err.error?.code ?? err.error?.type ?? "";
  const raw = String(err.message ?? "");
  // Niemals Schlüssel oder Header-Werte ausgeben
  if (/bearer|authorization|header|sk-|api[-_ ]?key/i.test(raw))
    return { code: "auth_format", reason: "Der OpenAI-Schlüssel ist ungültig formatiert oder falsch (z. B. Leerzeichen/Zeilenumbruch beim Kopieren). Bitte neuen Schlüssel erstellen und ohne Leerzeichen bei Render eintragen." };
  const msg = raw.replace(/sk-[^\s"']*/g, "sk-…").replace(/[A-Za-z0-9_-]{32,}/g, "…");
  const m = model ? `„${model}“` : "das Modell";
  if (status === 401) return { code: "auth", reason: "OpenAI-Schlüssel ungültig oder abgelaufen – bitte neuen Schlüssel bei Render eintragen." };
  if (status === 404 || code === "model_not_found") return { code: "model", reason: `Modell ${m} ist für dieses OpenAI-Konto nicht verfügbar – OPENAI_MODEL anpassen.` };
  if (status === 403) return { code: "forbidden", reason: `Kein Zugriff auf ${m} (ggf. muss die Organisation bei OpenAI verifiziert werden) – oder anderes Modell wählen.` };
  if (status === 429 && /quota|billing/i.test(`${code} ${msg}`)) return { code: "quota", reason: "OpenAI-Guthaben aufgebraucht oder Ausgabenlimit erreicht." };
  if (status === 429) return { code: "rate", reason: "OpenAI-Anfragelimit kurzzeitig erreicht – bitte gleich erneut versuchen." };
  if (status === 400) return { code: "bad_request", reason: `OpenAI hat die Anfrage abgelehnt: ${msg.slice(0, 160)}` };
  if (err.name === "APIConnectionTimeoutError" || /timed? ?out|timeout/i.test(msg)) return { code: "timeout", reason: "Zeitüberschreitung bei der KI – bitte erneut versuchen." };
  if (/incomplete|max_output_tokens/i.test(msg)) return { code: "incomplete", reason: "Die KI-Antwort wurde abgeschnitten (Ausgabelimit)." };
  return { code: code || "unknown", reason: msg.slice(0, 200) || "Unbekannter Fehler" };
}

/** Fehlertext ohne Schlüssel, Header-Werte oder lange Tokens – für Logs, Jobs und Anzeigen. */
export function safeErr(e: unknown): string {
  const raw = String((e as { message?: string })?.message ?? e ?? "");
  if (/bearer|authorization|sk-|api[-_ ]?key/i.test(raw)) return describeAiError(e).reason;
  return raw.replace(/[A-Za-z0-9_-]{32,}/g, "…").slice(0, 300);
}
