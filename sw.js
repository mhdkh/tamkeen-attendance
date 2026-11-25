/* Service Worker — يحفظ ملفات الصفحة لتعمل بلا إنترنت.
   عند أي تعديل على ملفات الصفحة غيّر رقم الإصدار هنا ليحدّث الأجهزة نفسها. */
var CACHE = 'tamkeen-att-1.0.0';
var FILES = ['./', './index.html', './app.js', './config.js', './jsQR.min.js', './manifest.webmanifest',
  './fonts/qomra-regular.woff2', './fonts/qomra-bold.woff2',
  './img/logo-gold.png', './img/logo-color.png', './img/pattern.png', './img/icon-192.png', './img/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;  // طلبات البوابة لا تمر من هنا
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
