// Service worker: guarda la app en el dispositivo para que abra sin internet.
// Con conexión siempre pide la versión más nueva de cada archivo (así nunca se mezclan archivos
// viejos con nuevos); sin conexión usa la copia guardada.
// Al publicar una versión nueva, sube el número de VERSION.
const VERSION = 'biblioteca-v12';

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
  'js/store.js',
  'js/stadium.js',
  'js/tennis.js',
  'js/stats.js',
  'js/backup.js',
  'js/dictionary.js',
  'js/quotecard.js',
  'vendor/three.module.js',
  'vendor/RoomEnvironment.js',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'themes/clasica.jpg',
  'themes/mansion.jpg',
  'themes/jazz.jpg',
  'themes/atico.jpg',
  'themes/paddock.jpg',
  'themes/tierra.jpg',
];

// Recursos de otros sitios que conviene guardar al usarse: fuentes y tablas de PDF.js.
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita guardar copias viejas que el navegador tenga de antes.
  const fresh = SHELL.map((u) => new Request(u, { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
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

  // La página y los archivos de la app: primero la red (revalidando), y si no hay conexión, lo guardado.
  if (url.origin === self.location.origin) {
    const nav = req.mode === 'navigate';
    const key = nav ? 'index.html' : req;
    // Una petición de navegación no se puede copiar con opciones: se arma una nueva con su URL.
    const netReq = nav ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        try {
          const res = await fetch(netReq);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          return (await cache.match(key, { ignoreSearch: true })) || Response.error();
        }
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
