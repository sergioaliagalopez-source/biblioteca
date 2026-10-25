// Service worker: guarda la app en el dispositivo para que abra sin internet.
// Al publicar una versión nueva, sube el número de VERSION para que los teléfonos la descarguen.
const VERSION = 'biblioteca-v3';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/main.js',
  'js/db.js',
  'js/cloud.js',
  'js/library3d.js',
  'js/reader.js',
  'js/pdfdoc.js',
  'js/identify.js',
  'js/sound.js',
  'js/textures.js',
  'js/themes.js',
  'js/scenes.js',
  'js/backdrops.js',
  'vendor/three.module.js',
  'vendor/RoomEnvironment.js',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'themes/clasica.jpg',
  'themes/mansion.jpg',
  'themes/jazz.jpg',
  'themes/atico.jpg',
];

// Recursos de otros sitios que conviene guardar al usarse: fuentes y tablas de PDF.js.
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La página: primero la red (para recibir actualizaciones), y si no hay conexión, la guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Archivos de la app: lo guardado al instante y, por detrás, se actualiza para la próxima vez.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // Fuentes y tablas de PDF.js: se guardan la primera vez que se usan.
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
  }
  // Todo lo demás (búsqueda de libros y portadas) va directo a internet.
});
