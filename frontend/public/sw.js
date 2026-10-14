// Platform Attendance Service Worker - Push Notifications & PWA
const CACHE_NAME = 'platform-chamcong-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Lắng nghe sự kiện Push từ máy chủ
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hệ Thống Chấm Công',
    body: 'Bạn có thông báo mới từ hệ thống chấm công.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: 'chamcong-alert',
    vibrate: [200, 100, 200]
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'chamcong-punch',
    vibrate: data.vibrate || [200, 100, 200],
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'Xem chi tiết' },
      { action: 'close', title: 'Đóng' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Khi người dùng bấm vào Push Notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
