/* 甜蜜小窝 Service Worker
   作用：
   1) 让网页可作为 PWA 安装（满足通知 API 的前提条件）
   2) 处理通知点击：点一下通知就聚焦/打开应用
   3) 简单离线缓存，断网也能打开壳子
*/
const CACHE = 'sweet-home-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 只缓存同源 GET；API 请求一律走网络
  if (req.method !== 'GET' || req.url.includes('api.github.com')) return;
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        try {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        } catch (_) {}
        return res;
      }).catch(() => cached)
    )
  );
});

// 点击通知 → 聚焦已有窗口或打开应用
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'open-orders' }); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

// 预留：接收来自页面的 postMessage（如手动触发通知）
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'notify') {
    self.registration.showNotification(d.title || '甜蜜小窝', {
      body: d.body || '',
      icon: d.icon || 'icon-192.png',
      badge: d.icon || 'icon-192.png',
      vibrate: [40, 60, 40],
      tag: 'sweet-order',
      renotify: true
    });
  }
});
