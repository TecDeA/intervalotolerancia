# Calculadora de Resistencias (4 Bandas) — PWA

Aplicación web del portal **TecDeA** para calcular el valor nominal de una
resistencia y el **intervalo real de valores** en que se encuentra según sus
bandas de color (código IEC 60062 de 4 bandas), convertida en **PWA
instalable y 100% funcional sin conexión**.

## Contenido del paquete

```
resistencias-pwa/
├── index.html              La aplicación (HTML + JS embebido)
├── manifest.webmanifest    Manifiesto PWA
├── sw.js                   Service Worker (aislado del SW del portal)
├── app.css                 Estilos (Tailwind v4 compilado, sin CDN)
├── captura-app.png         Captura de la app (referencia)
├── fonts/
│   ├── inter.css           @font-face auto-hospedada
│   └── inter-latin-var.woff2   Fuente Inter variable (SIL OFL 1.1)
└── icons/
    ├── icon-64x64.png … icon-512x512.png   (purpose: any)
    ├── icon-maskable-192x192.png / 512     (purpose: maskable, zona segura 80%)
    ├── apple-touch-icon.png                (iOS, 180×180)
    ├── favicon.ico + favicon-32x32.png
    └── icon-master.png                     (máster 1024×1024)
```

## Despliegue en el portal TecDeA (GitHub Pages)

1. Copia la carpeta completa dentro del repositorio del portal, por ejemplo:

   ```
   docs/resistencias/        (si el portal se publica desde /docs)
   ```

2. Sube el cambio (`git commit` + `git push`). GitHub Pages la servirá en:

   ```
   https://tecdea.github.io/resistencias/
   ```

3. No se necesita nada más: **ni build, ni dependencias, ni configuración**.
   Todos los enlaces del HTML, del manifest y del SW son relativos, así que
   la carpeta puede renombrarse o anidarse en otra ruta y todo seguirá
   funcionando (p. ej. `/apps/resistencias/`).

> Importante: el `Service-Worker-Allowed` no es necesario porque el SW se
> registra con ruta relativa (`sw.js`) y su scope natural ya es el
> subdirectorio de la app.

## Por qué el SW no interfiere con el del portal

El service worker de la app (`sw.js`) está diseñado para coexistir con el
SW del portal TecDeA registrado en la raíz (`scope: /`):

- **Scope propio**: al estar en el subdirectorio de la app, su scope máximo
  es ese subdirectorio. Dentro de él prevalece (el SW más específico gana);
  fuera de él el del portal sigue mandando **sin ningún cambio**.
- **Filtro por origen + prefijo de ruta**: el evento `fetch` solo atiende
  peticiones `GET` cuyo URL resuelto empieza por el directorio de la app.
  Navegaciones del portal, otros orígenes o peticiones `POST` se devuelven
  sin tocar.
- **Sin `clients.claim()`**: nunca arrebata el control de páginas ya
  abiertas (incluida la home del portal).
- **Caché propia con nombre único**: `resistencias-cache-v1.0.0`. En
  `activate` solo borra cachés con su propio prefijo `resistencias-cache-`,
  jamás las del portal.
- **Sin rutas globales**: comparación literal por prefijo, sin patrones que
  pudieran capturar rutas ajenas.

Estrategia de caché:

- Navegación: *network-first* con timeout de 4 s y fallback al documento
  precacheado (soporte offline inmediato).
- Estáticos (CSS, fuentes, iconos): *stale-while-revalidate*.
- Instalación atómica del precache; nueva versión con `skipWaiting` +
  recarga automática controlada desde la página.

## Bugs corregidos respecto a la versión original

1. **Dependencia de CDNs en el arranque** (Tailwind CDN + Google Fonts):
   la app no cargaba estilos ni tipografía sin conexión. Sustituido por CSS
   de Tailwind v4 compilado localmente (`app.css`) y la fuente Inter
   auto-hospedada (`fonts/`). Ahora es 100% offline.
2. **`updateCalculation()` sin salvaguarda**: si algún selector no tenía
   valor válido al primer arranque (valor `''`), `c1.digit` era `undefined`
   y el cálculo daba `NaN` silenciosamente. Añadida guarda que sale limpio
   si falta algún color.
3. **Punto de color de la banda 4 invisible con "Sin banda"**: el punto
   quedaba con `background: transparent` sobre fondo blanco (invisible).
   Ahora muestra el patrón de rayas diagonales, igual que en la tabla.
4. **Tabla de tolerancias: `<td>` con `flex`** (display table-cell +
   flex rompía la alineación de columnas en algunos navegadores). El
   swatch y el nombre ahora van en un `<span class="flex">` interno.
5. **Popover descolgado al girar/redimensionar**: al cambiar el tamaño de
   ventana, el popover mantenía coordenadas obsoletas. Ahora se cierra en
   `resize`.
6. **Accesibilidad del foco**: bandas del SVG y leyendas con `focus-visible`
   visible (antes el foco era invisible: `focus:outline-none` sin
   alternativa).
7. **`aria-hidden` / foco tras cerrar popover** con teclado: cierre con
   `Escape` añadido.
8. Detalles de marcado: `flex-shrink-0` → `shrink-0` (clase obsoleta en
   Tailwind v4), `scope="col"` en los `<th>`, `role="img"` + `aria-label`
   en el SVG, y cierre correcto de etiquetas.

## Pruebas realizadas

- Cálculo verificado con 7 combinaciones de bandas (Ω a MΩ, tolerancias
  del 0,1% al 20%, multiplicadores oro/plata) contra valores esperados
  calculados independientemente.
- Popover: apertura por clic en banda y en leyendas, selección correcta,
  cierre por selección, por botón, por clic fuera y por `Escape`.
- Acordeón de la tabla de tolerancias: apertura, cierre y clic en fila
  aplicando la tolerancia.
- Botón "Restablecer valores" → vuelve a 1 kΩ ±5%.
- **Offline**: con la red cortada la app recarga y funciona completa
  (título, cálculos, estilos, fuente).
- **Coexistencia de SWs**: con un SW del portal en la raíz registrado, la
  app en el subdirectorio es controlada por su propio SW tras recargar, el
  SW del portal sigue atendiendo la raíz, y recursos fuera del scope no son
  interceptados.
- Layout responsivo probado a 390 px (móvil) y 1280 px (escritorio), sin
  overflow horizontal.
- `beforeinstallprompt` disparado en Chrome (botón "Instalar app"
  visible), señal de PWA instalable.
- Sin errores ni advertencias en consola.

## Cambiar los iconos

Los iconos se generaron con el script `scripts/gen_icons.py` (Pillow). La
temática es una resistencia real con bandas marrón-negro-rojo-oro (1 kΩ
±5%) sobre fondo degradado oscuro con una barra de intervalo
mínimo–nominal–máximo. Si cambias los iconos, regenera los tamaños y
mantén los nombres referenciados en `manifest.webmanifest`.

## Licencias

- Código de la app: el del repositorio del portal TecDeA.
- Fuente Inter: SIL Open Font License 1.1 (auto-hospedada).
- Tailwind CSS v4.3.5 (CSS compilado incluido): MIT License.
