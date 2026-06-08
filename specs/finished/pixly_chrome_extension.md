# Pixly — Web Developer Toolset (Chrome Extension)

- **Estado:** Draft
- **Fecha:** 2026-06-08
- **Versión:** 0.2
- **Tipo:** Especificación funcional (sin detalle de implementación, salvo restricciones de producto explícitas)

> Nota de idioma: este documento de especificación está en español (idioma de trabajo).
> **Toda la UI, nombres de herramientas, etiquetas y textos visibles para el usuario final están en inglés.**

---

## 1. Resumen

**Pixly** es una extensión de Google Chrome (Manifest V3) que ofrece un conjunto de
herramientas ("tools") para apoyar el desarrollo y la revisión visual de páginas web.
Funciona como una **plataforma extensible**: cada herramienta es un módulo independiente
que se registra en Pixly y aparece automáticamente en la interfaz, de modo que agregar
nuevas herramientas en el futuro no requiere rediseñar la extensión.

En esta primera versión se incluyen dos herramientas:

1. **Fix Broken Images** — detecta imágenes rotas en la página y las reemplaza por
   placeholders que conservan la misma apariencia (tamaño, posición y forma) de la imagen
   original.
2. **Image Overlay** — permite "subir" una imagen (típicamente una exportación de UI desde
   Figma u otra herramienta de diseño), posicionarla sobre la página real y controlar su
   opacidad y blending mode para comparar el diseño contra la implementación.

Principios transversales del producto:

- **Persistencia por sitio:** una herramienta activada en un sitio permanece activa en ese
  sitio, incluso tras recargas completas (full reload). No se activa en sitios donde el
  usuario no la encendió.
- **No invasivo / reversible:** Pixly **no contamina el DOM real** de la página. Toda la UI
  propia de Pixly vive dentro de un **Shadow DOM** aislado, y cualquier interacción con
  elementos de la página es no destructiva y completamente reversible al desactivar.
- **Extensible:** la arquitectura de "tool registry" permite incorporar nuevas herramientas
  (medir, inspeccionar, etc.) sin cambiar el núcleo.

---

## 2. Objetivos y alcance

### 2.1 Objetivos

- Entregar a desarrolladores y diseñadores un set de utilidades de inspección/comparación
  visual accesibles directamente sobre cualquier página, sin DevTools ni herramientas
  externas.
- Que el estado de cada herramienta sea **predecible y persistente por sitio**.
- Que la extensión sea una **base sólida y extensible** para crecer en herramientas.

### 2.2 Dentro de alcance (v1)

- Núcleo de la extensión: popup de control, toolbar in-page en Shadow DOM, registry de
  herramientas, capa de persistencia por sitio.
- Herramienta **Fix Broken Images**.
- Herramienta **Image Overlay**.

### 2.3 Fuera de alcance (v1)

- Herramientas adicionales (medición de distancias, inspección de tipografías, regla/grid,
  color picker, etc.) — se diseñarán sobre el mismo registry en versiones futuras.
- Sincronización del estado/imágenes en la nube o entre dispositivos (el almacenamiento es
  local al navegador).
- Soporte para navegadores no basados en Chromium (Firefox/Safari).
- Detección y reemplazo de imágenes de fondo CSS (`background-image`) — ver
  [§6.7 Limitaciones conocidas](#67-limitaciones-conocidas-fix-broken-images).
- Múltiples overlays simultáneos sobre la misma página (v1 soporta uno por página).

---

## 3. Usuarios y user stories

**Persona principal:** desarrollador/a web o diseñador/a que revisa una implementación en el
navegador.

- **US-1 (Fix Broken Images):** Como desarrollador, quiero que las imágenes rotas de una
  página se reemplacen por placeholders con el mismo tamaño y posición, para entender el
  layout real sin que los íconos de imagen rota distorsionen la maqueta.
- **US-2 (Image Overlay):** Como diseñador/desarrollador, quiero superponer una exportación
  del diseño (Figma) sobre la página real con opacidad y blending mode ajustables, para
  verificar pixel a pixel si la implementación cumple el diseño.
- **US-3 (Persistencia):** Como usuario, quiero que las herramientas que activé en un sitio
  sigan activas tras recargar o navegar dentro del mismo sitio, para no reconfigurarlas en
  cada reload.
- **US-4 (Aislamiento por sitio):** Como usuario, quiero que las herramientas se activen
  **solo** en los sitios donde las encendí, para no afectar mi navegación normal.
- **US-5 (No invasivo):** Como usuario técnico, quiero que Pixly no altere el DOM real ni
  los estilos de la página, para que lo que veo refleje el sitio real (salvo el efecto
  explícito de la herramienta) y todo sea reversible.

---

## 4. Arquitectura funcional del núcleo

> Esta sección describe **capacidades** y **contratos** a nivel funcional, no su
> implementación concreta.

### 4.1 Modelo de "Tool" (registry extensible)

Cada herramienta es un módulo autocontenido que se **registra** en Pixly declarando, como
mínimo:

| Propiedad | Descripción |
|---|---|
| `id` | Identificador único y estable (p. ej. `fix-broken-images`, `image-overlay`). |
| `name` | Nombre visible en la UI (inglés). |
| `description` | Descripción corta para el popup. |
| `icon` | Ícono representativo. |
| `scope` | Alcance de persistencia: `origin` o `url` (ver §5). |
| `defaultState` | Estado inicial de la herramienta. |
| Ciclo de vida | `activate()`, `deactivate()`, `renderControls()`, `serializeState()`, `restoreState()`. |

El popup y la toolbar in-page se **construyen dinámicamente a partir del registry**: agregar
una herramienta nueva = registrar un módulo, sin tocar el núcleo ni la UI compartida.

**Requisito de extensibilidad (RF-CORE-1):** debe ser posible añadir una herramienta nueva
implementando este contrato, sin modificaciones en el código de las herramientas existentes
ni en la capa de persistencia.

### 4.2 Interfaces de usuario

Pixly tiene dos puntos de entrada complementarios:

1. **Popup de la extensión (browser action):** panel maestro. Lista todas las herramientas
   disponibles con un toggle on/off **para el sitio actual**, más un estado global
   (Pixly enabled/disabled). Es el control primario de activación.
2. **Toolbar in-page (Shadow DOM):** aparece sobre la página **cuando hay al menos una
   herramienta activa** en ese sitio. Muestra los **controles en vivo** de cada herramienta
   activa (p. ej. sliders del overlay). Es flotante, **arrastrable**, colapsable y ocultable.

**RF-CORE-2 (Shadow DOM):** Toda la UI propia de Pixly (toolbar, paneles, placeholders,
overlay y sus controles) se renderiza dentro de un **único host con Shadow DOM** adjunto al
documento. Los estilos de Pixly no deben filtrarse a la página ni verse afectados por los
estilos de la página.

**RF-CORE-3 (No contaminación del DOM):** Pixly no debe agregar nodos persistentes ni
modificar atributos/estilos en el DOM real de la página fuera de su host de Shadow DOM,
**excepto** las mutaciones no destructivas y reversibles que una herramienta requiera de
forma explícita (p. ej. ocultar una imagen rota). Toda mutación de ese tipo debe:
(a) guardar el estado original, y (b) restaurarse íntegramente al desactivar la herramienta.

### 4.3 Capa de persistencia

- El estado se guarda en almacenamiento local del navegador (`chrome.storage.local` para
  configuración liviana; almacenamiento de binarios grandes —imágenes del overlay— en
  IndexedDB para no exceder cuotas).
- La clave de persistencia se compone de **scope + toolId** (ver §5).
- Al cargar una página, el content script consulta la persistencia: si hay herramientas
  activas para ese scope, las **re-aplica automáticamente** (esto es lo que hace que
  sobrevivan a full reloads).

---

## 5. Modelo de activación y persistencia por sitio

### 5.1 Definición de "sitio" y scope

Cada herramienta declara su **scope** de persistencia:

| Scope | Clave | Uso | Herramienta v1 |
|---|---|---|---|
| `origin` | `scheme://host:port` | El efecto aplica a todo el origen (todas las rutas). | **Fix Broken Images** |
| `url` | URL completa (sin hash) | El efecto aplica a una página/ruta específica. | **Image Overlay** |

**Justificación:**
- *Fix Broken Images* es útil de forma transversal en todo un sitio → `origin`.
- *Image Overlay* compara un **diseño específico contra una pantalla específica**; un overlay
  no tiene sentido replicado en todas las rutas del origen → `url`.

> Esta granularidad es una **decisión de diseño recomendada**; ver
> [§11 Preguntas abiertas](#11-decisiones-de-diseño--preguntas-abiertas).

### 5.2 Reglas de activación

- **RF-ACT-1:** Activar una herramienta es una acción **explícita** del usuario (toggle en el
  popup o en la toolbar).
- **RF-ACT-2:** Una herramienta activa persiste para su scope hasta que el usuario la
  desactiva. Sobrevive a: recarga completa de la página, navegación a la misma URL/origen y
  reapertura de la pestaña.
- **RF-ACT-3:** Una herramienta **nunca** se activa en orígenes/URLs donde el usuario no la
  activó.
- **RF-ACT-4:** Al re-aplicarse tras un reload, el estado restaurado (posición, opacidad,
  imagen del overlay, etc.) debe ser idéntico al último estado guardado.
- **RF-ACT-5 (SPA):** En aplicaciones de página única, los cambios de ruta cliente (history
  API) se tratan como navegación: las herramientas con scope `url` se evalúan contra la nueva
  URL; las de scope `origin` permanecen activas.

---

## 6. Herramienta: Fix Broken Images

### 6.1 Descripción

Cuando está activa, detecta las imágenes rotas de la página y las reemplaza visualmente por
un **placeholder** que ocupa exactamente el mismo espacio y forma que la imagen original,
de modo que el layout no se distorsione. Está pensada para revisar maquetas donde faltan
recursos o las URLs apuntan a entornos sin assets.

### 6.2 Detección de "imagen rota"

Una `<img>` se considera rota si, tras intentar cargar, cumple alguna condición:

- Disparó el evento `error`, **o**
- Está `complete` pero con `naturalWidth === 0` (y `naturalHeight === 0`).

Consideraciones:

- **Carga dinámica / lazy-load:** se observa el DOM (MutationObserver) y los eventos de carga
  para detectar imágenes que se agregan o que fallan después de la activación. Las imágenes
  `loading="lazy"` solo se evalúan una vez que el navegador intenta cargarlas; no se marcan
  como rotas antes de tiempo.
- **Umbral mínimo:** imágenes intencionalmente diminutas (p. ej. tracking pixels de 1×1) se
  **ignoran** bajo un tamaño mínimo configurable por defecto, para no ensuciar la página con
  placeholders irrelevantes.
- **Alcance v1:** solo elementos `<img>` (incluyendo los resueltos vía `<picture>`/`srcset`).

### 6.3 Apariencia del placeholder

El placeholder debe **replicar la apariencia ocupada** por la imagen original:

- **Dimensiones renderizadas** (ancho/alto computados, no solo atributos), respetando
  `object-fit`, `border-radius`, márgenes y posición en el flujo del layout.
- Aspecto visual de "placeholder intencional": fondo neutro con patrón (p. ej. borde
  punteado o franjas diagonales suaves) y un glifo de "imagen rota".
- **Metadatos útiles para desarrollo**, mostrados si el espacio lo permite y/o en hover:
  - Dimensiones (p. ej. `320 × 240`).
  - Texto `alt` original (si existe).
  - Nombre de archivo / URL rota (en hover/tooltip).

**Técnica de render (in-place, sin ghosting):** el placeholder se aplica **modificando el
propio elemento `<img>`** en el DOM real, no como un overlay separado en Shadow DOM. En
concreto:

- Se conserva el mismo elemento `<img>` (mantiene tamaño computado, `object-fit`,
  `border-radius` y posición en el flujo), por lo que **scrollea de forma nativa, sin
  retraso ni JS de tracking** → **no hay efecto fantasma**.
- Se intercambia su `src` por un **SVG inline (data-URI)** que dibuja el placeholder al
  tamaño exacto del box renderizado, incluyendo los metadatos (dimensiones, `alt`).
- Se neutraliza la fuente rota responsive (`srcset` / `<source>`) para que no vuelva a
  imponerse.

**Reversibilidad:** antes de mutar, se guardan los atributos originales (`src`, `srcset`,
etc.) en data-attributes propios de Pixly; al desactivar se restauran íntegros y el DOM
queda exactamente como estaba (RF-CORE-3). Esta mutación in-place es la **excepción
explícita y reversible** que permite el RF-CORE-3; el principio de Shadow DOM (RF-CORE-2)
sigue aplicando a la UI propia de Pixly (toolbar, overlay y sus controles).

> Decisión: se descartó el placeholder como overlay en Shadow DOM porque, al tener que
> rastrear la posición de la imagen en cada scroll/resize/reflow, introduce lag y efecto
> fantasma. La mutación in-place del `<img>` elimina ese problema de raíz.

### 6.4 Comportamiento

- **Al activar:** escanea el DOM, detecta imágenes rotas, aplica el placeholder in-place a
  cada `<img>` (guardando antes sus atributos originales) y comienza a observar cambios para
  cubrir imágenes nuevas o que fallen luego.
- **Mientras está activa:** como el placeholder vive en el propio `<img>`, sigue el layout de
  forma nativa (scroll/resize/reflow) sin sincronización por JS ni ghosting. Si una imagen
  previamente rota pasa a cargar correctamente, se restaura su contenido original.
- **Al desactivar:** restaura `src`/`srcset` y demás atributos originales de cada imagen
  desde los data-attributes guardados, y deja de observar. El DOM real queda **exactamente**
  como estaba.

### 6.5 Happy path

1. El usuario abre el popup de Pixly en un sitio con imágenes rotas y activa **Fix Broken
   Images**.
2. Pixly escanea la página; cada imagen rota se cubre con un placeholder del mismo tamaño,
   posición y forma, mostrando dimensiones y `alt`.
3. El layout se ve coherente; el usuario navega/recarga y los placeholders se re-aplican
   automáticamente en el mismo origen.
4. El usuario desactiva la herramienta: los placeholders desaparecen y la página vuelve a su
   estado original.

### 6.6 Sad paths

- **No hay imágenes rotas:** la herramienta queda activa sin efecto visible; si luego aparece
  una imagen rota (contenido dinámico), se cubre automáticamente.
- **Imagen dentro de iframe cross-origin:** Pixly no puede acceder al contenido; la imagen no
  se procesa (limitación documentada). Iframes same-origin sí se procesan (best-effort).
- **Imagen que falla y luego carga (reintentos):** el placeholder se muestra al fallar y se
  retira automáticamente si finalmente carga.
- **Imagen con dimensiones 0 por CSS (oculta):** no se cubre (no ocupa espacio); se reevalúa
  si pasa a ser visible.
- **Páginas con cientos de imágenes:** el escaneo y la observación deben mantenerse
  performantes (procesamiento por lotes / debounce de reflows); no debe congelar la página.

### 6.7 Limitaciones conocidas (Fix Broken Images)

- No cubre `background-image` de CSS en v1 (futuro).
- No procesa contenido de iframes cross-origin.
- Imágenes servidas correctamente pero "visualmente vacías" (p. ej. un PNG transparente
  válido) **no** se consideran rotas, porque cargan sin error.

---

## 7. Herramienta: Image Overlay

### 7.1 Descripción

Permite cargar una imagen (export de diseño) y superponerla sobre la página real para
compararla. El usuario controla opacidad, blending mode, posición, escala y la
interactividad (lock), para validar si la implementación coincide con el diseño.

### 7.2 Carga de la imagen

Formas de "subir" la imagen:

- Selector de archivos (file picker).
- Arrastrar y soltar un archivo sobre el panel de la herramienta.
- Pegar desde el portapapeles (paste), útil para exports directos.

Formatos: imágenes raster comunes (PNG, JPG, WEBP) y SVG. La imagen se persiste localmente
(IndexedDB) para sobrevivir a reloads.

### 7.3 Controles

| Control | Descripción | Rango / valores |
|---|---|---|
| **Opacity** | Transparencia del overlay. | 0–100% |
| **Blend mode** | `mix-blend-mode` del overlay sobre la página. | `normal`, `multiply`, `screen`, `overlay`, `difference`, `exclusion`, … (incluye **`difference`**, el modo clásico para comparación pixel-perfect). |
| **Position** | Desplazamiento X/Y. Arrastre directo + entrada numérica + **nudge** con flechas del teclado (1px; con modificador, 10px). | px |
| **Scale** | Escala del overlay (p. ej. exports a 2x). | % o factor |
| **Lock** | Cuando está **locked**, el overlay no intercepta el puntero (`pointer-events: none`) y el usuario interactúa con la página debajo. Cuando está **unlocked**, el overlay es arrastrable. | on/off |
| **Show / Hide** | Oculta el overlay sin removerlo (conserva configuración e imagen). | on/off |
| **Replace / Remove** | Cambiar la imagen o quitar el overlay por completo. | — |

### 7.4 Posicionamiento e interacción

- El overlay se renderiza dentro del Shadow DOM de Pixly, por **encima** del contenido de la
  página (z-index alto), en posición fija respecto al viewport.
- Posición inicial: alineado al `top-left` del viewport (origen 0,0) para facilitar el
  calce con layouts anclados arriba.
- **RF-OVL-1 (Drag con pointer capture):** el arrastre del overlay **debe** implementarse con
  **Pointer Events + `setPointerCapture`** sobre el elemento del overlay. No usar listeners de
  `mouse*` a nivel `document`: estos pierden el `mouseup` y provocan que el overlay siga
  "fantasma" al cursor (y se vaya al top-left). *(Lección ya registrada en el proyecto.)*
- Si la imagen es mayor que el viewport, se puede arrastrar para inspeccionar distintas zonas.

### 7.5 Persistencia

- Scope `url`: el overlay (imagen + opacidad + blend + posición + escala + lock + visibilidad)
  se asocia a la URL donde se creó y **se re-aplica idéntico tras un full reload** de esa URL.
- La imagen binaria se guarda localmente (IndexedDB); la configuración liviana en
  `chrome.storage.local`.

### 7.6 Happy path

1. El usuario activa **Image Overlay** en la página de la implementación.
2. Sube/pega el export de Figma; la imagen aparece superpuesta en el top-left del viewport.
3. Ajusta opacidad (~50%) o usa blend `difference`, arrastra para alinear y afina con las
   flechas del teclado.
4. Compara diseño vs. implementación; activa **Lock** para clickear la página por debajo.
5. Recarga la página: el overlay reaparece con la misma imagen y configuración.
6. Al terminar, hace **Remove** o desactiva la herramienta.

### 7.7 Sad paths

- **Archivo no soportado / corrupto:** se muestra un mensaje de error en la UI (inglés) y no
  se crea overlay.
- **Imagen muy grande (excede cuota de almacenamiento):** se advierte al usuario; el overlay
  funciona en la sesión pero puede no persistir, o se ofrece reducir/omitir persistencia.
- **Overlay tapa toda la UI:** el usuario puede usar **Hide**, bajar opacidad o **Lock** para
  recuperar el control de la página; la toolbar de Pixly siempre permanece accesible.
- **Cambio de ruta en SPA:** al cambiar la URL, el overlay de la URL anterior se retira; si la
  nueva URL tenía un overlay guardado, se aplica el suyo.
- **`setPointerCapture` no disponible / gesto interrumpido:** el drag debe degradar
  limpiamente (cancelar arrastre) sin dejar el overlay pegado al cursor.

---

## 8. UI compartida y experiencia

- **RF-UI-1:** Todos los textos visibles están en **inglés**.
- **RF-UI-2:** El popup lista las herramientas del registry con su toggle on/off para el sitio
  actual y un indicador claro de cuáles están activas.
- **RF-UI-3:** La toolbar in-page aparece solo si hay herramientas activas, es arrastrable,
  colapsable y ocultable, y nunca debe quedar inaccesible.
- **RF-UI-4:** Estados visuales claros: herramienta activa vs. inactiva, errores de carga,
  y feedback de acciones (p. ej. "Image added", "Restored").
- **RF-UI-5:** La UI no debe interferir con el contenido de la página cuando las herramientas
  están en modo de no interacción (overlay locked, toolbar colapsada).

---

## 9. Permisos y consideraciones técnicas (Manifest V3)

A nivel funcional, Pixly requiere:

- **Almacenamiento local** para persistir estado e imágenes (`storage`, IndexedDB).
- **Acceso a las páginas donde el usuario activa herramientas** (content scripts / `scripting`
  + host permissions). Se prefiere un modelo que **minimice permisos**: idealmente activar el
  acceso por sitio bajo demanda (p. ej. `activeTab` + concesión por sitio) en vez de
  `<all_urls>` permanente, coherente con "solo donde el usuario lo activó".
- **Service worker (MV3):** coordina persistencia y estado entre pestañas; los content scripts
  aplican el efecto en cada página.

> La estrategia exacta de permisos se afinará en implementación; el requisito funcional es
> **mínimo privilegio** y **activación por sitio**.

---

## 10. Enfoque de pruebas

### 10.1 Pruebas automatizadas

- **Unitarias:**
  - Detección de imágenes rotas (casos: `error`, `naturalWidth===0`, lazy, umbral mínimo,
    `srcset`).
  - Cálculo de geometría/forma del placeholder a partir de estilos computados.
  - Capa de persistencia: serialización/restauración por scope (`origin` vs `url`),
    incluyendo aislamiento entre sitios.
  - Registry: alta de una herramienta ficticia y render dinámico en la UI (valida
    extensibilidad, RF-CORE-1).
- **End-to-end (Puppeteer/Playwright cargando la extensión):**
  - Activar Fix Broken Images en una página de prueba con imágenes rotas → placeholders
    correctos → reload → persisten → desactivar → DOM restaurado.
  - Image Overlay: subir imagen → ajustar opacidad/blend/posición → drag con pointer capture
    (verificar que **no** quede pegado al cursor tras soltar, RF-OVL-1) → reload → estado
    idéntico → remove.
  - Aislamiento por sitio: activar en sitio A no afecta a sitio B (RF-ACT-3).

> Para cada test, estructurar el cuerpo en **Arrange / Act / Assert** y marcar los métodos de
> test con el atributo/decorador correspondiente del framework (según convención del proyecto).

### 10.2 Matriz de pruebas manuales

- Sitios con muchas imágenes / lazy-load / `srcset` / iframes (same-origin y cross-origin).
- Overlay con imágenes muy grandes y muy pequeñas; blend `difference` para calce pixel-perfect.
- SPAs con navegación cliente (history API) para validar scope `url` vs `origin` (RF-ACT-5).
- Reload completo y reapertura de pestaña para validar persistencia (RF-ACT-2/4).

---

## 11. Decisiones de diseño (resueltas)

1. **Granularidad de persistencia del Image Overlay:** ✅ **`url`** (página específica) en v1.
2. **Imágenes rotas — técnica de placeholder:** ✅ **Mutación in-place del `<img>`** (swap de
   `src` por SVG inline, reversible), no overlay en Shadow DOM. Motivo: un placeholder-overlay
   tendría que rastrear la imagen en cada scroll/reflow → lag y ghosting; el `<img>` mutado
   scrollea nativo sin retraso (ver [§6.3](#63-apariencia-del-placeholder)). El Image Overlay,
   en cambio, **sí** permanece en Shadow DOM porque está anclado al viewport y no rastrea
   ningún elemento, por lo que no presenta ghosting.
3. **Modelo de permisos:** ✅ **Mínimo privilegio** (`activeTab` + concesión por sitio).
4. **Múltiples overlays por página:** ✅ **Fuera de v1 — diferido a la siguiente versión.**

---

## 12. Resumen de requisitos funcionales

| ID | Requisito |
|---|---|
| RF-CORE-1 | Agregar una herramienta nueva solo implementa el contrato de Tool; no toca el núcleo ni otras tools. |
| RF-CORE-2 | Toda la UI de Pixly vive en un Shadow DOM aislado; sus estilos no se filtran ni se ven afectados. |
| RF-CORE-3 | No se contamina el DOM real; mutaciones necesarias son no destructivas y reversibles. |
| RF-ACT-1 | La activación de una herramienta es explícita del usuario. |
| RF-ACT-2 | Las herramientas activas persisten por scope y sobreviven a full reloads. |
| RF-ACT-3 | Las herramientas se activan solo en los sitios donde el usuario las encendió. |
| RF-ACT-4 | El estado restaurado tras reload es idéntico al último estado guardado. |
| RF-ACT-5 | Cambios de ruta en SPA se evalúan según el scope de cada herramienta. |
| RF-OVL-1 | El drag del overlay usa Pointer Events + setPointerCapture; sin listeners mouse* en document. |
| RF-UI-1..5 | UI en inglés, construida desde el registry, no intrusiva y con estados/feedback claros. |
