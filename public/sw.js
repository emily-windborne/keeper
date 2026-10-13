self.addEventListener("push", (event) => {
  let payload = { title: "Keeper", body: "", url: "/" };
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      payload = {
        title: typeof data.title === "string" ? data.title : "Keeper",
        body: typeof data.body === "string" ? data.body : "",
        url: typeof data.url === "string" ? data.url : "/",
      };
    }
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const windowClient = windows[0];
      if (windowClient) {
        if (typeof windowClient.navigate === "function") {
          try {
            await windowClient.navigate(target);
          } catch {
            // Older browsers open a new window instead.
          }
        }
        if ("focus" in windowClient) return windowClient.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
