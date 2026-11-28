// DEAL-NIVO Service Worker – App-Shell-Caching für statische Assets.
// Personenbezogene Inhalte (API, Berichte, Uploads) werden NIE gecacht.
const CACHE = "dealnivo-v3";
// Nur die Besichtigungsseiten werden für die Offline-Nutzung auf DEINEM Gerät zwischengespeichert.
const INSPECTION_CACHE = "dealnivo-inspection-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== INSPECTION_CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Besichtigung: Netz zuerst, bei fehlender Verbindung die zuletzt geladene Fassung (Offline-Checkliste)
  if (req.mode === "navigate" && /^\/analysis\/[^/]+\/besichtigung$/.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(INSPECTION_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/analysis/") || url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/admin")) return;

  // Bilder & 3D-Modelle: sofort aus dem Speicher zeigen, im Hintergrund aktualisieren
  if (url.pathname.startsWith("/demo/") || url.pathname.startsWith("/models/")) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const fresh = fetch(req).then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          });
          if (hit) fresh.catch(() => undefined);
          return hit || fresh;
        }),
      ),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

// Web Push (Preisalarm / Inseratsänderungen)
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { title: "DEAL-NIVO", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(self.registration.showNotification(d.title || "DEAL-NIVO", { body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: d.url || "/" } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(target.href).then((w) => (w || c).focus());
      return self.clients.openWindow(target.href);
    }),
  );
});
