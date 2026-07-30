# Herramienta: Snapshot & Compare

## 1. Descripción

Captura el viewport visible de la página y lo vuelve a poner encima como capa de comparación,
con blend `difference` por defecto: los píxeles idénticos se ven negros y cualquier cambio desde
la captura "brilla". El caso de uso: capturar antes de un cambio (CSS, deploy, experimento) y
comparar después, sin salir de la página ni abrir un editor de imágenes.

## 2. User story

Como desarrollador aplicando cambios visuales, quiero capturar el estado actual de la página y
compararlo contra lo que veo después del cambio, para detectar regresiones o desplazamientos
involuntarios al instante.

## 3. Comportamiento

- **Scope `url`.** La captura persiste por página: el binario PNG en IndexedDB (mismo store que
  el Image Overlay), la metadata liviana en `chrome.storage`. Sobrevive recargas; si el binario
  fue desalojado, el estado se limpia y la UI ofrece capturar de nuevo.
- **Captura:** botón "Capture snapshot" en el panel. El flujo: se oculta la UI de Pixly (host
  `visibility: hidden` + doble rAF para garantizar el frame pintado), el content script pide la
  captura al service worker (`chrome.tabs.captureVisibleTab` solo existe en contextos de
  extensión), y se restaura la UI. El PNG llega como dataUrl → blob → IndexedDB, borrando el
  binario del retake anterior.
- **Metadata de procedencia:** cada captura guarda timestamp (ISO), **título de la página** y
  **URL** al momento del capture; el panel los muestra (elipsados, con tooltip completo) para
  saber exactamente de dónde salió la captura.
- **Anclaje 1:1:** la capa se ancla al documento en la posición de scroll donde se capturó, y su
  tamaño se calcula desde las dimensiones reales del PNG ÷ devicePixelRatio del momento de la
  captura — render 1:1 en píxeles CSS, nunca estirado. (El PNG cubre el viewport completo
  incluyendo el canal de la scrollbar; estirarlo a `clientWidth` lo comprimiría y desfasaría la
  comparación progresivamente hacia la derecha.) Botón "Go to capture" hace scroll suave hasta
  el punto de captura.
- **Comparación:** opacidad (5–100%, default 100%), blend mode (los 8 del overlay, default
  `difference`), toggle Hide, botón Remove (borra binario + metadata). El blend vive en el root
  de la capa (no en el `<img>`) por la misma razón que el Image Overlay: `mix-blend-mode` solo
  compone contra el backdrop del stacking context padre.
- **Pointer-transparent** siempre: es una imagen de referencia, nunca un target de interacción.
  Z-order: entre el Image Overlay y el Grid (`… > overlay > snapshot > grid`).
- **Permisos:** al activar la herramienta desde el popup se solicita el **permiso persistente
  del sitio** (`chrome.permissions.request` con el origin, vía `optional_host_permissions` ya
  declarado) — la llamada va síncrona dentro del clic del usuario, requisito de Chrome para
  mostrar el prompt. Concedido una vez, la captura funciona en ese origin para siempre
  (recargas incluidas). Si el usuario lo niega, se cae al comportamiento `activeTab` (funciona
  hasta la siguiente navegación) y el error de captura guía a reabrir el popup y re-activar la
  herramienta. Sin permisos obligatorios nuevos en el manifest.

## 4. Fuera de alcance

- Captura de página completa (full-page scroll & stitch); solo el viewport visible.
- Diff programático con score/umbral (la comparación es visual, vía blend).
- Historial de múltiples snapshots por página (uno por página; retake reemplaza).
- Enviar la captura al Image Overlay como imagen arrastrable.

## 5. Pruebas

- Unitarias (`tests/snapshot-state.test.ts`): defaults (difference, opaco, sin captura),
  saneamiento (metadata huérfana sin imageKey, clamps de opacidad, blend desconocido, geometría
  negativa/NaN), namespacing de keys por página+timestamp, formato del timestamp (TZ-safe) y
  entrada no parseable.
- Manuales: capturar → la capa difference vuelve la página negra (idéntica); cambiar algo del DOM
  → el cambio brilla; retake reemplaza; título/URL/fecha correctos en el panel; "Go to capture"
  regresa al scroll original; recarga restaura la captura; Remove limpia todo; la captura NO
  incluye la UI de Pixly (pill/grid/guías ocultas durante el capture); con activeTab caducado el
  error guía a reabrir el popup.
