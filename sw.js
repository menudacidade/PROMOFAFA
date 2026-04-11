// Incrementa a versão sempre que os assets principais mudam
const CACHE_NAME = 'promocity-cache-v11';

// Apenas arquivos estáticos que raramente mudam.
// O index.html NUNCA é cacheado aqui para evitar que o SW sirva HTML
// em resposta a pedidos de JS/CSS (causa "Unexpected end of input").
const CORE_ASSETS = [
  './css/style.css',
  './js/utils.js',
  './js/supabase.js',
  './js/database.js',
  './js/auth.js',
  './js/map.js',
  './js/ui.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // falha silenciosa — app funciona mesmo sem cache
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Nunca cacheia o HTML principal — sempre busca da rede para garantir atualizações
  const url = new URL(request.url);
  const isHtml = request.headers.get('Accept')?.includes('text/html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('.html');
  if (isHtml) return; // deixa o browser buscar diretamente da rede

  // Nunca cacheia requisições a CDNs externos (Supabase, Leaflet, FontAwesome, etc.)
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) return;

  // Estratégia: cache-first para assets locais, com fallback para rede
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      // Não está no cache: busca da rede
      return fetch(request).then((response) => {
        // Só cacheia respostas válidas de assets locais
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Rede indisponível e não há cache: retorna 503 em vez de undefined
        // (undefined causaria que o browser servisse conteúdo errado)
        return new Response('Serviço temporariamente indisponível.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});
