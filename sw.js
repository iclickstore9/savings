// แคชไฟล์ไว้ให้เปิดได้ตอนออฟไลน์ (ข้อมูลเงินออมอยู่ใน localStorage ไม่เกี่ยวกับไฟล์นี้)
// กลยุทธ์: ไฟล์โค้ด (html/js/css) = เน็ตก่อน → ได้เวอร์ชันใหม่ทันที, ออฟไลน์ค่อยใช้แคช
//          ฟอนต์/ไอคอน = แคชก่อน (ไม่ค่อยเปลี่ยน)
const CACHE = 'kapook-om-v17';
const FILES = [
  './', 'index.html', 'style.css', 'themes.css', 'theme.js', 'fonts.css', 'icons.js', 'plan.js', 'money.js', 'budget.js', 'app.js', 'cloud.js', 'firebase-config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'fonts/prompt-thai-400.woff2', 'fonts/prompt-thai-500.woff2', 'fonts/prompt-thai-600.woff2', 'fonts/prompt-thai-700.woff2',
  'fonts/prompt-latin-400.woff2', 'fonts/prompt-latin-500.woff2', 'fonts/prompt-latin-600.woff2', 'fonts/prompt-latin-700.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = ข้ามแคช HTTP ของเบราว์เซอร์ ได้ไฟล์ล่าสุดจริง ๆ
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

const isStatic = (url) => /\.(woff2|png|svg)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Firebase SDK จาก gstatic: แคชไว้ให้เปิดออฟไลน์ได้ (ไฟล์ตามเวอร์ชัน ไม่เปลี่ยน)
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  if (url.origin !== location.origin) return;

  if (isStatic(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  e.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
