/*
 * Service Worker — Calculadora de Resistencias (TecDeA)
 * =====================================================
 *
 * DISEÑO DE AISLAMIENTO RESPECTO AL SERVICE WORKER DEL PORTAL
 * -----------------------------------------------------------
 * Esta app vivirá en un subdirectorio de https://tecdea.github.io/
 * (p. ej. https://tecdea.github.io/resistencias/), mientras que el SW del
 * portal está registrado en la raíz con scope "/".
 *
 * Reglas de oro de este SW para no interferir:
 *
 * 1. UBICACIÓN Y SCOPE PROPIOS: se registra como "sw.js" relativo a la
 *    página, por lo que su scope máximo es el subdirectorio de la app
 *    (p. ej. /resistencias/). Un SW con scope más específico prevalece
 *    sobre el del portal SOLO dentro de este subdirectorio; el resto del
 *    portal sigue siendo controlado por su propio SW sin ningún cambio.
 *
 * 2. FILTRO ESTRICTO POR ORIGEN+RUTA: en el evento `fetch` solo se
 *    procesan peticiones de tipo GET cuyo URL, resuelto contra el scope
 *    propio, comience por el prefijo del directorio de la app. Cualquier
 *    otra petición (páginas del portal, otros orígenes, APIs...) se
 *    devuelve sin tocar al navegador con `return;` — el SW del portal o
 *    la red la atienden con normalidad.
 *
 * 3. SIN EXTENSIONES DE RUTAS: no se usan patrones ni globales que
 *    pudieran capturar rutas ajenas; la comparación es literal por
 *    prefijo de directorio.
 *
 * 4. SIN CLAIM GLOBAL: no se llama a clients.claim() en el activate,
 *    así que este SW nunca "arrebata" el control de páginas ya abiertas
 *    (incluida la home del portal si el usuario la tenía abierta).
 *
 * 5. CACHÉ CON NOMBRE ÚNICO VERSIONADO: "resistencias-cache-v1". Nunca
 *    borra ni toca cachés con otros nombres (los del portal incluidos);
 *    en activate solo elimina las versiones antiguas de su propia caché.
 *
 * ESTRATEGIA DE CACHÉ
 * -------------------
 * - Precache: instalación atómica (si un recurso falla, la instalación
 *   falla y no se activa una versión a medias).
 * - Navegación (documentos): network-first con timeout corto y fallback
 *   al index.html precacheado (soporte offline inmediato).
 * - Resto de recursos propios (CSS, JS, fuentes, iconos): stale-while-
 *   revalidate para respuesta instantánea y actualización en segundo
 *   plano.
 */

'use strict';

/* Versión de la app: bump para invalidar cachés anteriores. */
const APP_VERSION = 'v1.0.0';
const CACHE_NAME = `resistencias-cache-${APP_VERSION}`;

/*
 * Directorio base real del SW (p. ej. https://tecdea.github.io/resistencias/).
 * Se deriva de self.registration.scope, así que funciona igual en
 * producción, en un subdirectorio distinto o en pruebas locales.
 */
const APP_SCOPE_URL = new URL(self.registration.scope);
/* Prefijo de ruta que delimita "nuestros" recursos (p. ej. /resistencias/). */
const APP_PATH_PREFIX = APP_SCOPE_URL.pathname;

/**
 * Indica si una URL pertenece a la app (mismo origen y bajo su subdirectorio).
 * Es la barrera de aislamiento frente al SW del portal y a terceros.
 */
function isAppRequest(url) {
    return url.origin === self.location.origin && url.pathname.startsWith(APP_PATH_PREFIX);
}

/* Recursos esenciales para funcionar 100% offline. */
const PRECACHE_URLS = [
    './',
    'index.html',
    'app.css',
    'manifest.webmanifest',
    'fonts/inter.css',
    'fonts/inter-latin-var.woff2',
    'icons/icon-192x192.png',
    'icons/icon-512x512.png',
    'icons/icon-maskable-192x192.png',
    'icons/icon-maskable-512x512.png',
    'icons/favicon-32x32.png',
    'icons/apple-touch-icon.png'
];

/* Instalación: precache atómico de la carcasa de la aplicación. */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS.map(u => new URL(u, APP_SCOPE_URL).href)))
            .then(() => self.skipWaiting()) // activar la nueva versión sin esperar
    );
});

/* Activación: limpiar SOLO las cachés antiguas de esta app (prefijo propio). */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((n) => n.startsWith('resistencias-cache-') && n !== CACHE_NAME)
                    .map((n) => caches.delete(n))
            ))
            .then(() => self.clients.matchAll({ type: 'window' }).then((clientList) => {
                // Notificar a las ventanas controladas para que puedan recargar
                clientList.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION }));
            }))
    );
});

/* Mensajes de la página (p. ej. SKIP_WAITING al detectar nueva versión). */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * Navegación: network-first con timeout y fallback offline al documento
 * precacheado. Si la petición de navegación es del portal (fuera del
 * scope), ni siquiera entra aquí: se devuelve sin manipular.
 */
async function handleNavigation(request) {
    const TIMEOUT_MS = 4000;

    try {
        const networkResponse = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
        ]);
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const shell = await cache.match('index.html') ||
                       await cache.match(new URL('index.html', APP_SCOPE_URL).href);
        if (shell) return shell;
        return new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Sin conexión</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem"><h1>Sin conexión</h1><p>No se pudo cargar la Calculadora de Resistencias y no hay copia en caché.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

/**
 * Recursos estáticos propios: stale-while-revalidate.
 * Devuelve copia en caché al instante (si existe) y refresca en segundo
 * plano; si no hay copia, va a la red.
 */
async function handleStatic(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request).then((response) => {
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => undefined);

    return cached || network || new Response('', { status: 504, statusText: 'Offline' });
}

/* Intercepción de peticiones: SOLO recursos de esta app. */
self.addEventListener('fetch', (event) => {
    const request = event.request;

    /* AISLAMIENTO: cualquier cosa que no sea un GET dentro de nuestro
     * subdirectorio se ignora por completo (el resto de SWs y la red
     * siguen mandando). Esto incluye toda la web del portal TecDeA. */
    if (request.method !== 'GET') return;
    if (!isAppRequest(new URL(request.url))) return;

    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(handleNavigation(request));
    } else {
        event.respondWith(handleStatic(request));
    }
});
