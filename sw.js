const CACHE_NAME = 'fundamiga-v1';
const ASSETS = [
  './consulta-personal.html',
  './manifest.json',
  './icon-512.png'
];

// Instalar: cachear los assets esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: red primero, cache como fallback
self.addEventListener('fetch', event => {
  // Solo interceptar requests del mismo origen
  if (!event.request.url.startsWith(self.location.origin) &&
      !event.request.url.includes('supabase.co')) {
    return;
  }

  // Para Supabase (datos): red siempre, sin cache
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(fetch(event.request).catch(() => new Response('[]', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Para assets locales: red primero, cache como fallback
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
