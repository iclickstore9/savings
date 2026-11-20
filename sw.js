// แคชไฟล์ไว้ให้เปิดได้ตอนออฟไลน์ (ข้อมูลเงินออมอยู่ใน localStorage ไม่เกี่ยวกับไฟล์นี้)
const CACHE = 'kapook-om-v4';
const FILES = [
  "./", "index.html", "style.css", "fonts.css", "icons.js", "plan.js", "app.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "fonts/prompt-thai-400.woff2", "fonts/prompt-thai-500.woff2", "fonts/prompt-thai-600.woff2", "fonts/prompt-thai-700.woff2", "fonts/prompt-latin-400.woff2", "fonts/prompt-latin-500.woff2", "fonts/prompt-latin-600.woff2", "fonts/prompt-latin-700.woff2",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// ใช้ไฟล์ในแคชก่อนเพื่อความเร็ว แล้วอัปเดตแคชจากเน็ตเบื้องหลัง
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
