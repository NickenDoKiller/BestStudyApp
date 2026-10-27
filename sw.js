/* =========================================================
   Service Worker — Cache toàn bộ app để chạy offline
   ========================================================= */
const CACHE_VERSION = 'study-v7';   // ⭐ đổi số này khi muốn force update
const CACHE_NAME = CACHE_VERSION;

// Danh sách file cần cache
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './marked.min.js',
  './manifest.json',

  // Âm thanh
  './bg_theme.wav',
  './click_sound.wav',

  // KaTeX
  './katex/katex.min.css',
  './katex/katex.min.js',
  './katex/contrib/auto-render.min.js',

  // Icons
  './icon-192.png',
  './icon-512.png'
];

// ⚠️ KaTeX fonts: quá nhiều file để liệt kê tay.
// Cách thông minh: cache theo pattern (xem bên dưới).
const FONT_PATTERN = /\/katex\/fonts\/.*\.(woff2?|ttf)$/;

/* =========================================================
   INSTALL — cache toàn bộ tài nguyên
   ========================================================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Đang cache tài nguyên...');

      // Cache các file chính (nếu 1 file fail thì vẫn tiếp tục)
      await Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Bỏ qua:', url, err.message))
        )
      );

      console.log('[SW] Cache xong tài nguyên chính');
      self.skipWaiting(); // Kích hoạt SW mới ngay
    })
  );
});

/* =========================================================
   ACTIVATE — xoá cache cũ khi có bản mới
   ========================================================= */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Xoá cache cũ:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* =========================================================
   FETCH — phục vụ từ cache trước, fallback mạng
   ========================================================= */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bỏ qua request không phải từ origin (CDN, analytics...)
  if (url.origin !== self.location.origin) {
    return;
  }

  // ===== Cache-first cho tài nguyên tĩnh =====
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Có trong cache → return ngay (offline-friendly)
        // Nhưng vẫn update ngầm nếu có mạng (stale-while-revalidate)
        fetch(request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, res.clone()));
          }
        }).catch(() => {}); // Không có mạng thì thôi

        return cached;
      }

      // ===== Chưa có trong cache: thử lấy từ mạng =====
      return fetch(request).then(res => {
        // Cache lại nếu là tài nguyên hợp lệ
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => {
            // Cache cả fonts KaTeX theo pattern
            if (FONT_PATTERN.test(url.pathname) || !url.pathname.includes('/api/')) {
              cache.put(request, clone);
            }
          });
        }
        return res;
      }).catch(() => {
        // Offline + không có cache → trả về trang chủ
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* =========================================================
   MESSAGE — cho phép app chủ động update
   ========================================================= */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
