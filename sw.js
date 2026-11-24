// خدمة التخزين المؤقت لواجهة التطبيق. طلبات الخادم تمر دائمًا عبر الشبكة.
var CACHE = 'ada-shell-v33';
var SHELL = ['./', 'index.html', 'styles.css?v=33', 'lists.js?v=33', 'ideas.js?v=33', 'api.js?v=33', 'restore.js?v=33', 'app.js?v=33', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'assets/header.png', 'assets/footer.png', 'assets/moe-logo.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(event.request, copy); });
      return res;
    }).catch(function () { return caches.match(event.request); })
  );
});
