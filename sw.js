/* 甜蜜小窝 Service Worker —— network-first 版
   重要：HTML 一律“网络优先”，保证 GitHub 更新后能立刻拿到新版，
   不会再出现“清了缓存还是旧页面”的问题。断网时才回退到缓存。
*/
const CACHE = 'sweet-home-v3';            // 换版本号 → 自动淘汰旧缓存
const ASSETS = ['manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();                      // 新 SW 立刻进入等待→激活
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())    // 立刻接管所有页面
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
    // HTML：网络优先，拿到就用并更新缓存；断网才用缓存
    e.respondWith(
      fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('index.html')))
    );
    return;
  }

  // 其它静态资源：缓存优先（这些很少变；图标/manifest 变了也会因版本号刷新）
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } catch (_) {}
        return res;
      }).catch(() => cached)
    )
  );
});

// 点击通知 → 聚焦/打开应用，并跳订单页
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

// 接收页面消息：手动触发通知 / 立即跳过等待
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
