/**
 * Umgang mit nicht vertrauenswürdigen Inhalten (Inseratstexte, Bewertungen,
 * OCR-Text). Diese Inhalte dürfen niemals Systemfunktionen steuern.
 */

const MAX_TEXT = 12_000;

/** Entfernt Steuerzeichen und begrenzt die Länge. */
export function sanitizeUntrustedText(input: string | undefined | null, max = MAX_TEXT): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .slice(0, max)
    .trim();
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignor(e|iere)\s+(all|alle|previous|vorherige|bisherige)/i,
  /(previous|vorherigen?|obigen?)\s+(instructions|anweisungen)/i,
  /\bsystem\s*(prompt|:)/i,
  /\b(du bist|you are)\s+(jetzt|now)\b/i,
  /(bewerte|rate|score)\s+(dieses|this)\s+(angebot|listing|deal)\s+(mit|as|als)\s+\d+/i,
  /\b(ai|ki|chatgpt|gpt|assistant|assistent)\s*[:,]\s*(gib|give|bewerte|rate|antworte|answer)/i,
  /<\s*\/?\s*(system|instructions?|untrusted)/i,
];

/** Erkennt typische Prompt-Injection-Muster in fremden Inhalten. */
export function detectPromptInjection(text: string | undefined | null): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

/**
 * Verpackt fremde Inhalte für die KI in klar markierte Datenblöcke.
 * Spitze Klammern werden neutralisiert, damit der Block nicht „ausbrechen“ kann.
 */
export function wrapUntrusted(label: string, text: string): string {
  const safe = sanitizeUntrustedText(text).replace(/</g, "‹").replace(/>/g, "›");
  return `<untrusted_data source="${label}">\n${safe}\n</untrusted_data>`;
}
