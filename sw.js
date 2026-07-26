// ============================================================
// RIPPLE — Service Worker
// File ini WAJIB ada di root domain (sejajar dengan index.html /
// chat.html), bukan di dalam folder, supaya scope-nya mencakup
// seluruh situs.
// ============================================================

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Event ini yang dipanggil browser saat ada push dari server —
// JALAN WALAU TAB/BROWSER SUDAH DITUTUP, selama browser (proses
// background-nya) masih boleh jalan di OS (umumnya begitu di
// desktop & Android; di iOS Safari perlu PWA "Add to Home Screen"
// dulu baru push berfungsi saat app ditutup).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Ripple", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Ripple";
  const options = {
    body: data.body || "",
    tag: data.tag || "ripple-notif",
    renotify: true,
    data: { url: data.url || "/chat.html" },
    requireInteraction: data.kind === "call", // notif panggilan tidak hilang sendiri
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi -> fokuskan tab Ripple yang sudah terbuka, atau buka baru
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/chat.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes("chat.html"));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
