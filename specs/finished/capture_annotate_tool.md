# Herramienta: Capture & Annotate

## 1. Descripción

Captura el viewport visible de la página y abre un editor a pantalla completa para anotar la
captura con flechas, líneas, rectángulos y elipses antes de compartirla. El PNG exportado lleva
**embebido un banner de procedencia** con el título de la página, la URL y la fecha/hora de la
captura: vaya donde vaya la imagen, su origen viaja con ella. El caso de uso: comunicar un bug o
un detalle visual señalando exactamente QUÉ mirar y DE DÓNDE salió la captura, sin salir del
navegador ni abrir un editor de imágenes.

## 2. User story

Como desarrollador o QA reportando un problema visual, quiero capturar la página, marcarla con
flechas y figuras, y exportar una imagen que incluya el título y la URL de la página, para que
quien la reciba entienda al instante qué mirar y dónde reproducirlo.

## 3. Comportamiento

- **Scope `origin`.** Solo persisten las preferencias de dibujo (herramienta, color y grosor
  últimos usados) — livianas, en `chrome.storage`. Las anotaciones viven en la sesión de edición
  y salen por el export; cerrar el editor las descarta.
- **Captura:** botón "Capture & annotate" en el panel. Mismo flujo que Snapshot & Compare: se
  oculta la UI de Pixly (host `visibility: hidden` + doble rAF), el content script pide la
  captura al service worker (`chrome.tabs.captureVisibleTab` solo existe en contextos de
  extensión; se reutiliza el mensaje `pixly/capture-visible-tab` existente), y se restaura la
  UI. El PNG llega como dataUrl → blob → `ImageBitmap` y abre el editor.
- **Editor modal a pantalla completa** dentro del Shadow DOM, por encima de toda la UI de Pixly
  (`--pixly-z-editor`, nuevo primer nivel del Z_ORDER). Canvas con la captura 1:1 en píxeles CSS
  (dimensiones reales del PNG ÷ devicePixelRatio); si no cabe, se escala con `max-width` y el
  mapeo de puntero compensa vía `getBoundingClientRect`. Todo DOM imperativo + Pointer Events —
  nunca Preact — para que el trazo sea preciso.
- **Herramientas de anotación como plugins.** Cada herramienta es un módulo independiente que
  implementa `AnnotationToolSpec` (`id`, `name`, `icon`, `render(ctx, annotation)`), registrado
  en `annotation-tools/index.ts`. La toolbar del editor, el bucle de render y el saneamiento de
  estado se construyen desde ese registro: **agregar una figura nueva = un módulo + una línea en
  el registro**, sin tocar editor ni exportador (el mismo patrón RF-CORE-1 del ToolRegistry, un
  nivel más abajo). El editor es dueño del ciclo del drag (start → end, preview en vivo,
  descarte de drags < 3px); las herramientas solo deciden cómo PINTAR el gesto. Set v1: flecha
  (cabeza escalada al grosor), línea, rectángulo y elipse (inscrita en el drag, estilo Figma).
- **Estilo:** paleta de 6 colores (rojo por defecto — lee sobre cualquier página) y 3 grosores
  (2/4/7 px). Cada anotación congela su estilo al dibujarse; cambiar el estilo después no muta
  las existentes. Undo (botón o Ctrl/Cmd+Z), Clear, Esc cierra.
- **Export con procedencia embebida:** "Download PNG" y "Copy" (clipboard; si falla, el feedback
  redirige a Download). El export compone: banner (título en negrita, URL + fecha en muted,
  regla de acento de marca) + captura + anotaciones re-renderizadas con los MISMOS renderers del
  editor bajo transform de dpr. El banner escala con el devicePixelRatio de la captura para que
  el texto case con la densidad del PNG; título y URL se elipsan al ancho disponible. Nombre de
  archivo: `pixly-capture-<host>-<timestamp>.png`. La statusbar del editor muestra qué se va a
  embeber.
- **Permisos:** `needsHostPermission` como Snapshot & Compare — activar desde el popup solicita
  el permiso persistente del sitio dentro del gesto del usuario; sin él, cae a `activeTab` y el
  error de captura guía a re-abrir el popup. Sin cambios en el manifest ni en el service worker.

## 4. Fuera de alcance

- Persistir anotaciones o la sesión de edición entre recargas (el export es el artefacto).
- Herramienta de texto, freehand y selección/edición de anotaciones ya dibujadas (el modelo
  drag start→end y el registro admiten agregarlas después).
- Captura de página completa (scroll & stitch); solo el viewport visible.
- Compartir directo a servicios externos (el PNG descargado/copiado es el canal).

## 5. Pruebas

- Unitarias (`tests/annotation-geometry.test.ts`): normalización del rect en las cuatro
  direcciones de drag, elipse inscrita independiente de la dirección, distancia de drag,
  longitud de cabeza de flecha (escala y mínimo), alas simétricas y a distancia exacta del tip,
  shaft de longitud cero sin NaN.
- Unitarias (`tests/capture-annotate-state.test.ts`): defaults, saneamiento (toolId desconocido,
  colores malformados, clamp/round de grosor), nombre de archivo (host saneado + timestamp,
  href no parseable) y formato de timestamp (TZ-safe, entrada inválida).
- Unitarias (`tests/annotation-tools.test.ts`): registro (ids únicos, metadata completa, lookup),
  cada herramienta pinta con el estilo de la anotación (ctx stub que graba llamadas), layout del
  export (banner apilado, escala con dpr, piso en 1x) y elipsado por ancho.
- Manuales: capturar → el editor abre con la captura nítida (retina incluido); dibujar cada
  figura en las cuatro direcciones; preview en vivo durante el drag; click sin drag no crea
  nada; undo/clear/Esc; cambiar color/grosor no altera lo ya dibujado; export descarga un PNG
  con banner correcto (título/URL/fecha, elipsado en URLs largas) y las anotaciones alineadas
  1:1; Copy pega en un editor externo; las preferencias de estilo sobreviven recargas; la
  captura NO incluye la UI de Pixly.
