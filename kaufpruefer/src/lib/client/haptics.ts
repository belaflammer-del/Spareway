/** Kurzes Vibrationsfeedback (Android/Chrome). iOS-Safari unterstützt das nicht – dann passiert nichts. */
export function haptic(kind: "tap" | "success" | "warning" = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const pattern = { tap: 10, success: [12, 60, 18], warning: [30, 50, 30] }[kind];
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignorieren */
  }
}
