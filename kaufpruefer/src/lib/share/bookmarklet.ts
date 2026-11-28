/**
 * Quelltext des „→ DEAL-NIVO“-Buttons (Lesezeichen / Bookmarklet).
 *
 * Läuft ausschließlich im Browser des Nutzers auf der Seite, die er selbst
 * geöffnet hat. Liest nur sichtbare Inhalte (Titel, Preis, Beschreibung,
 * Detailfelder, strukturierte Seitendaten, Bildadressen) und öffnet damit
 * DEAL-NIVO. Die Daten stehen im Adress-Anker (#…) – sie landen dadurch weder
 * in Server-Logs noch beim Marktplatz. Keine Cookies, keine Passwörter, keine
 * Nachrichten werden gelesen.
 */

function capture(origin: string) {
  const d = document;
  const txt = (sel: string): string => {
    const e = d.querySelector(sel) as HTMLElement | null;
    return e ? (e.innerText || e.textContent || "").trim() : "";
  };
  const details: [string, string][] = [];
  const push = (k: string, v: string) => {
    k = k.replace(/\s+/g, " ").trim();
    v = v.replace(/\s+/g, " ").trim();
    if (k && v && k.length < 120 && v.length < 300 && details.length < 80) details.push([k, v]);
  };
  // Kleinanzeigen-Detailliste
  d.querySelectorAll("li.addetailslist--detail").forEach((li) => {
    const v = li.querySelector(".addetailslist--detail--value") as HTMLElement | null;
    if (v) push((li as HTMLElement).innerText.replace(v.innerText, ""), v.innerText);
  });
  // Allgemein: Definitionslisten und zweispaltige Tabellen (mobile.de, AutoScout24, eBay …)
  d.querySelectorAll("dl").forEach((dl) => {
    const dts = dl.querySelectorAll("dt");
    dts.forEach((dt) => {
      const dd = dt.nextElementSibling as HTMLElement | null;
      if (dd && dd.tagName === "DD") push((dt as HTMLElement).innerText, dd.innerText);
    });
  });
  d.querySelectorAll("tr").forEach((tr) => {
    const c = tr.querySelectorAll("th,td");
    if (c.length === 2) push((c[0] as HTMLElement).innerText, (c[1] as HTMLElement).innerText);
  });
  const jsonLd = Array.from(d.querySelectorAll('script[type="application/ld+json"]'))
    .slice(0, 6)
    .map((s) => (s.textContent || "").slice(0, 30000));
  const meta: Record<string, string> = {};
  d.querySelectorAll('meta[property^="og:"],meta[property^="product:"],meta[name="description"]').forEach((m) => {
    const k = m.getAttribute("property") || m.getAttribute("name");
    if (k) meta[k] = (m.getAttribute("content") || "").slice(0, 3000);
  });
  const images: string[] = [];
  d.querySelectorAll("img").forEach((i) => {
    const im = i as HTMLImageElement;
    const s = im.getAttribute("data-imgsrc") || im.getAttribute("data-src") || im.currentSrc || im.src;
    if (s && /^https:/.test(s) && (im.naturalWidth >= 300 || im.getAttribute("data-imgsrc")) && images.indexOf(s) < 0 && images.length < 20) images.push(s);
  });
  const page = {
    v: 1,
    url: location.href,
    title: txt("#viewad-title") || txt("h1"),
    price: txt("#viewad-price") || txt('[data-testid*="price" i]') || txt('[class*="price" i]'),
    description: (txt("#viewad-description-text") || txt('[data-testid*="description" i]')).slice(0, 6000),
    location: txt("#viewad-locality"),
    details,
    jsonLd,
    meta,
    images,
    text: "",
  };
  let json = JSON.stringify(page);
  // Seitentext nur als Rückfall, wenn kaum Daten gefunden wurden
  if (!page.price && details.length < 3) {
    page.text = ((d.querySelector("main") as HTMLElement | null) || d.body).innerText.slice(0, 8000);
    json = JSON.stringify(page);
  }
  // Länge begrenzen (Adressen dürfen nicht beliebig lang werden)
  if (json.length > 60000) {
    page.jsonLd = [];
    page.text = "";
    json = JSON.stringify(page);
  }
  const target = `${origin}/teilen#seite=${encodeURIComponent(json)}`;
  const w = window.open(target, "_blank");
  if (!w) location.href = target;
}

/** Fertiger `javascript:`-Link für das Lesezeichen. */
export function bookmarkletHref(origin: string): string {
  const src = `(${capture.toString()})(${JSON.stringify(origin)});void 0`;
  // Vollständig kodiert: Browser dekodieren javascript:-Adressen, „%“ im Code würde sonst stören
  return `javascript:${encodeURIComponent(src)}`;
}
