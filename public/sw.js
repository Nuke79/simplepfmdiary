const CACHE_NAME = "peakflow-v6";
const BASE = "/simplepfmdiary";
const STATIC_ASSETS = [
  BASE + "/",
  BASE + "/manifest.json",
  BASE + "/icon-192.png",
  BASE + "/icon-512.png",
];

let reminderTimer = null;

/* Install: cache core assets, activate immediately to replace old SW */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* Activate: delete old caches, claim all clients immediately */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* Message handler: schedule/cancel reminders and notify about updates */
self.addEventListener("message", (event) => {
  const { type, delay, title, body, tag } = event.data || {};

  if (type === "SCHEDULE_REMINDER") {
    // Clear any existing reminder
    if (reminderTimer) clearTimeout(reminderTimer);

    // Schedule notification via SW (works when page is in background)
    reminderTimer = setTimeout(() => {
      self.registration.showNotification(title || "Дневник ПФМ", {
        body: body || "Время сделать замер!",
        icon: BASE + "/icon-192.png",
        badge: BASE + "/icon-192.png",
        tag: tag || "peakflow-reminder",
        vibrate: [200, 100, 200],
        requireInteraction: true,
      });
      // Notify the page to show a toast too
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "REMINDER_FIRED" });
        });
      });
      reminderTimer = null;
    }, delay || 30 * 60 * 1000);

    // Respond to confirm scheduling
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ scheduled: true, delay: delay });
    }
  }

  if (type === "CANCEL_REMINDER") {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = null;
    }
  }
});

/* Handle notification click — open the app */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus existing window or open new
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(BASE + "/");
    })
  );
});

/* Fetch: network-first for navigation, cache-first for assets */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) return;

  // Navigation: always try network first to get fresh content
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(BASE + "/"))
    );
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});
