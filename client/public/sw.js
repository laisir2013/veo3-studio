// PO Studio Service Worker
// 版本號 - 每次更新時修改此值
const SW_VERSION = '2.0.1';
const CACHE_NAME = `po-studio-v${SW_VERSION}`;
const STATIC_CACHE = `po-studio-static-v${SW_VERSION}`;
const DYNAMIC_CACHE = `po-studio-dynamic-v${SW_VERSION}`;

// 需要緩存的靜態資源
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing Service Worker v${SW_VERSION}...`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        // 立即激活新版本，不等待舊版本關閉
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating Service Worker v${SW_VERSION}...`);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // 刪除所有舊版本的緩存
              return name.startsWith('po-studio-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE &&
                     name !== CACHE_NAME;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        // 立即控制所有頁面
        return self.clients.claim();
      })
      .then(() => {
        // 通知所有客戶端有新版本
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: SW_VERSION
          });
        });
      })
  );
});

// 監聽來自頁面的消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

// 攔截網絡請求 - 使用 Network First 策略確保獲取最新內容
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳過非 GET 請求
  if (request.method !== 'GET') {
    return;
  }

  // 跳過 API 請求（不緩存動態數據）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/')) {
    return;
  }

  // 跳過外部請求
  if (url.origin !== location.origin) {
    return;
  }

  // 對於 HTML 和 JS 文件，使用 Network First 策略
  if (request.destination === 'document' || 
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css') ||
      url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // 網絡失敗，嘗試從緩存獲取
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // 返回離線頁面
            if (request.destination === 'document') {
              return caches.match('/');
            }
            return new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // 對於其他資源（圖片等），使用 Cache First 策略
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // 返回緩存的響應，同時在後台更新緩存
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(DYNAMIC_CACHE)
                    .then((cache) => cache.put(request, networkResponse.clone()));
                }
              })
              .catch(() => {})
          );
          return cachedResponse;
        }

        // 沒有緩存，從網絡獲取
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // 緩存新的響應
            const responseToCache = networkResponse.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => cache.put(request, responseToCache));

            return networkResponse;
          })
          .catch(() => {
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// 處理推送通知
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '您有新的視頻生成完成！',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'view', title: '查看' },
      { action: 'close', title: '關閉' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('PO Studio', options)
  );
});

// 處理通知點擊
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// 後台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-videos') {
    console.log('[SW] Background sync triggered');
  }
});

console.log(`[SW] Service Worker v${SW_VERSION} loaded`);
