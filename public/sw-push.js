/**
 * Service Worker для Web Push уведомлений
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "Новое уведомление",
      body: event.data.text(),
    };
  }

  const title = data.title || "Уведомление";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || "default",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
