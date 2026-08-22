self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    let data = {
        title: "StreetMan Barber Phuket",
        body: "มีคิวใหม่",
        url: "dashboard.html"
    };
    try {
        if (event.data) {
            data = Object.assign(data, event.data.json());
        }
    } catch (err) {}
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "../img/logo.PNG",
            badge: "../img/logo.PNG",
            data: { url: data.url || "dashboard.html" }
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "dashboard.html";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (let i = 0; i < clients.length; i += 1) {
                if (clients[i].url.indexOf("/barber/") !== -1 && "focus" in clients[i]) {
                    return clients[i].focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }
            return undefined;
        })
    );
});
