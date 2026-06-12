/* 甜蜜小窝 Service Worker —— network-first 版 + 真·后台推送
   重要：HTML 一律“网络优先”，保证 GitHub 更新后能立刻拿到新版，
   不会再出现“清了缓存还是旧页面”的问题。断网时才回退到缓存。
*/
const CACHE = 'sweet-home-v4';            // 换版本号 → 自动淘汰旧缓存（这次加了 push，记得升版本）
const ASSETS = ['manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('api.github.com')) return;
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html') ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
        return res;
      }).catch(() => cached)
    )
  );
});

// ★★★ 真·后台推送：收到服务器（GitHub Actions）推来的消息 → 弹系统通知 ★★★
// 这是“App 完全关闭也能收到”的关键，不需要页面在运行。
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {
    data = { title: '甜蜜小窝', body: e.data ? e.data.text() : '对方有新动作~' };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || '甜蜜小窝 · 新订单', {
      body: data.body || '对方下单啦，快去看看~',
      icon: data.icon || 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [40, 60, 40],
      tag: 'sweet-order',
      renotify: true,
      data: { url: './index.html' }
    })
  );
});

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
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'skip-waiting') { self.skipWaiting(); return; }
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
