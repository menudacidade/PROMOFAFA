// =============================================================================
// PROMOCITY — Service Worker
// 'message' registrado sincronicamente PRIMEIRO: Chrome exige que o handler
// seja adicionado na avaliação inicial do script (não dentro de callbacks).
// =============================================================================

// ─── [1] MESSAGE ─────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =============================================================================
// Cache
// =============================================================================

const CACHE_NAME = 'promocity-cache-v17';

const CORE_ASSETS = [
  './css/style.css',
  './js/utils.js',
  './js/supabase.js',
  './js/database.js',
  './js/auth.js',
  './js/map.js',
  './js/ui.js',
  './js/app.js',
];

// ─── [2] INSTALL ─────────────────────────────────────────────────────────────
// skipWaiting() força ativação imediata; cache.addAll() pré-carrega assets.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
});

// ─── [3] ACTIVATE ────────────────────────────────────────────────────────────
// clients.claim() assume controle imediato; remove caches de versões antigas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      ),
    ])
  );
});

// ─── [4] FETCH ────────────────────────────────────────────────────────────────
// Estratégia cache-first para assets estáticos. HTML e requests externos
// passam direto para a rede sem cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // HTML: sempre busca da rede (conteúdo sempre atualizado)
  const isHtml =
    request.headers.get('Accept')?.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');
  if (isHtml) return;

  // Requests externos: passa sem cache
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          new Response('Serviço temporariamente indisponível.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        );
    })
  );
});
