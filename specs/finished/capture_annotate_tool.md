# Herramienta: Capture & Annotate

## 1. Descripción

Captura el viewport visible, un área arrastrada o un elemento concreto de la página, y abre un
editor a pantalla completa para anotar la captura con flechas, líneas, rectángulos, elipses,
etiquetas de texto y sellos de emoji antes de compartirla. El PNG exportado lleva
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
- **Captura en tres modos** desde el panel: **View** (viewport completo), **Area** (marquee de
  arrastre con readout de tamaño en vivo) y **Element** (picker estilo DevTools: hover resalta
  el elemento con caja + chip de identidad `tag#id.clase — W × H`, click lo elige). Mismo flujo
  base que Snapshot & Compare: se oculta la UI de Pixly (host `visibility: hidden` + doble rAF),
  el content script pide la captura al service worker (`chrome.tabs.captureVisibleTab` solo
  existe en contextos de extensión; se reutiliza el mensaje `pixly/capture-visible-tab`
  existente), y se restaura la UI. Los modos con alcance recortan el PNG del viewport a la
  región elegida (CSS px × dpr, clampeada a las dimensiones reales del bitmap, mínimo 8×8 px;
  el rect de un elemento se clipea al viewport — captureVisibleTab no ve más allá). Los pickers
  se quitan ANTES de capturar (nunca salen en la foto), Esc cancela, y son cancelables
  externamente (`RegionPick.cancel()`) para que desactivar la herramienta a mitad de pick no
  deje un overlay bloqueando la página. El PNG llega como dataUrl → blob → `ImageBitmap`
  (recortado si aplica) y abre el editor.
- **Editor modal a pantalla completa** dentro del Shadow DOM, por encima de toda la UI de Pixly
  (`--pixly-z-editor`, nuevo primer nivel del Z_ORDER). Canvas con la captura 1:1 en píxeles CSS
  (dimensiones reales del PNG ÷ devicePixelRatio); si no cabe, se escala con `max-width` y el
  mapeo de puntero compensa vía `getBoundingClientRect`. Todo DOM imperativo + Pointer Events —
  nunca Preact — para que el trazo sea preciso.
- **Herramientas de anotación como plugins.** Cada herramienta es un módulo independiente que
  implementa `AnnotationToolSpec` (`id`, `name`, `icon`, `interaction?`, `glyphs?`,
  `render(ctx, annotation)`), registrado en `annotation-tools/index.ts`. La toolbar del editor,
  el bucle de render y el saneamiento de estado se construyen desde ese registro: **agregar una
  figura nueva = un módulo + una línea en el registro**, sin tocar editor ni exportador (el
  mismo patrón RF-CORE-1 del ToolRegistry, un nivel más abajo). El editor es dueño de los
  ciclos de gesto declarados por `interaction` — `'drag'` (default: start → end, preview en
  vivo, descarte de drags < 3px), `'text'` (click abre un textarea inline en el punto: Enter
  commit, Shift+Enter salto de línea, blur commit, Esc cancela; sin soft-wrap para que lo
  tecleado sea lo renderizado) y `'stamp'` (click sella el glifo activo; el editor ofrece los
  `glyphs` de la herramienta como paleta secundaria) — y las herramientas solo deciden cómo
  PINTAR el gesto. Set v1: flecha (cabeza escalada al grosor), línea, rectángulo, elipse
  (inscrita en el drag, estilo Figma), **texto** (multi-línea, sombra suave para legibilidad
  sobre cualquier fondo) y **emoji** (12 glifos de reacción, sellados centrados en el click).
- **Modo Move (reposicionar y redimensionar):** botón propio del editor al inicio de la
  toolbar (es un modo de gesto, no una herramienta de pintura, así que no vive en el registro).
  Con Move activo, el drag sobre el cuerpo de la anotación superior bajo el puntero la traslada
  (start y end se desplazan juntos; cursor `move`). El hit-testing del cuerpo es **por
  herramienta** vía el método opcional `hitTest(ctx, annotation, point)` del spec: líneas y
  flechas se agarran cerca del trazo (distancia al segmento, no su bounding box), rectángulos
  por todo su marco, elipses por su interior elíptico (las esquinas de la caja pasan de largo),
  texto por su caja medida (`measureText`) y emoji por un cuadrado del tamaño del sello;
  herramientas sin `hitTest` caen a un bounding box acolchado. Elegir cualquier herramienta de
  pintura sale del modo Move.
- **Resize por grips:** al hacer hover sobre una figura de drag en modo Move aparecen dos
  manijas (círculos blancos con borde del color de la anotación) en sus puntos start/end;
  arrastrar una re-ancla ese extremo al puntero — la flecha cambia su cabeza de lugar, el
  rectángulo/elipse mueven esa esquina, la línea ese extremo. El grip gana sobre el cuerpo
  (radio de agarre 8 px, más generoso que el dibujo de 4.5 px), el cursor se orienta al grip
  (`nwse`/`nesw`/`ew`/`ns-resize` según su posición relativa al extremo opuesto) y en una
  figura colapsada gana el grip `end`, que es lo que permite volver a abrirla. Texto y emoji
  no se redimensionan por grips: su tamaño lo dictan los presets de grosor. Los grips son
  cosa del editor (solo del repaint del hover); jamás salen en el export.
- **Barrera de teclado modal:** con el editor abierto, ningún evento de teclado llega a la
  página. Sin esto, el retargeting del Shadow DOM hace que la página vea las teclas del
  editor con el host `<div>` como target (no un campo editable), y los hot keys de una letra
  (GitHub, Gmail…) se disparan mientras el usuario escribe una etiqueta. Dos mitades: en
  `window` (fase de captura) se frenan las teclas que NO van hacia el DOM del editor —
  `composedPath()[0]` da el target real a través del shadow root abierto —, y las que sí van
  (el textarea las necesita) se frenan en el borde del editor al subir (bubble en el root),
  cubriendo `keydown`/`keypress`/`keyup`. Esc y Ctrl+Z del editor siguen funcionando; la
  barrera muere con el editor.
- **Estilo:** paleta de 6 colores (rojo por defecto — lee sobre cualquier página) y 3 grosores
  (2/4/7 px); el grosor también escala el tamaño del texto y de los emojis (un solo control de
  escala, métricas puras en `text-metrics.ts`). Cada anotación congela su estilo y contenido al
  dibujarse; cambiar el estilo después no muta las existentes. Undo (botón o Ctrl/Cmd+Z; con un
  texto abierto Ctrl+Z es el undo nativo del textarea), Clear, Esc cierra (con un texto abierto,
  Esc primero cancela el texto).
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
- Freehand, rotación de anotaciones, resize de texto/emoji por grips (su tamaño viene de los
  presets de grosor), borrado individual, undo de movimientos/resizes (undo sigue quitando la
  última anotación creada) y emojis personalizados fuera del set (el modelo de puntos + el
  registro admiten agregarlos después).
- Captura de página completa (scroll & stitch); los tres modos operan sobre el viewport
  visible (el rect de un elemento más alto que el viewport se recorta a lo visible).
- Compartir directo a servicios externos (el PNG descargado/copiado es el canal).

## 5. Pruebas

- Unitarias (`tests/annotation-geometry.test.ts`): normalización del rect en las cuatro
  direcciones de drag, elipse inscrita independiente de la dirección, distancia de drag,
  longitud de cabeza de flecha (escala y mínimo), alas simétricas y a distancia exacta del tip,
  shaft de longitud cero sin NaN, distancia punto-segmento (perpendicular, clamp a extremos,
  segmento degenerado), punto-en-rect con padding, grips (radio de agarre, prioridad de `end`
  en figuras colapsadas) y orientación del cursor de resize (diagonales, ejes, colapso).
- Unitarias (`tests/capture-annotate-state.test.ts`): defaults, saneamiento (toolId desconocido,
  colores malformados, clamp/round de grosor), nombre de archivo (host saneado + timestamp,
  href no parseable) y formato de timestamp (TZ-safe, entrada inválida).
- Unitarias (`tests/annotation-tools.test.ts`): registro (ids únicos, metadata completa, lookup,
  paleta no vacía en stamps), cada herramienta pinta con el estilo de la anotación según su
  interacción (ctx stub que graba llamadas), texto multi-línea/vacío, emoji centrado/sin glifo,
  traslación de anotaciones (puntos desplazados, estilo/texto intactos), hit-testing por
  herramienta (trazo vs. bounding box, interior de elipse vs. esquinas, caja medida del texto,
  cuadrado del emoji, sin contenido → sin hit), layout del export (banner apilado, escala con
  dpr, piso en 1x) y elipsado por ancho.
- Unitarias (`tests/text-metrics.test.ts`): escalado de fuentes con el grosor (texto y stamp,
  stamp > texto), line height proporcional, split de líneas (CRLF, vacías interiores vs.
  finales).
- Unitarias (`tests/annotation-editor-keys.test.ts`, DOM con happy-dom): la barrera de teclado
  bloquea teclas dirigidas a la página con el editor abierto, deja que los targets internos
  del editor las reciban sin que escapen a la página, y desaparece al destruir el editor.
- Unitarias (`tests/capture-region.test.ts`): viabilidad mínima, clipping al viewport
  (overflow y fuera de pantalla) y mapeo región CSS → crop en píxeles de dispositivo (escala
  por dpr, clamp al bitmap, región inaplicable → null, dpr no positivo → 1).
- Manuales: capturar en los tres modos → el editor abre con la captura nítida (retina
  incluido); en Area el marquee mide en vivo y Esc cancela; en Element el hover resalta con
  chip de identidad y el click captura solo su caja; dibujar cada figura en las cuatro
  direcciones; preview en vivo durante el drag; click sin drag no crea nada; texto: Enter/blur
  commit, Shift+Enter multi-línea, Esc cancela solo el texto, vacío se descarta; emoji: la
  paleta aparece solo con la herramienta activa y el sello queda centrado; Move: cada tipo de
  anotación se agarra y reposiciona (línea solo cerca del trazo, elipse no en sus esquinas),
  la de arriba gana en solapes, el hover muestra grips en las figuras de drag y arrastrarlos
  redimensiona (cabeza de flecha, esquina de rect/elipse, extremo de línea) con el cursor
  orientado, texto/emoji no muestran grips, los grips nunca aparecen en el export y elegir
  una herramienta sale del modo; en una página con hot keys de una letra (p. ej. GitHub),
  escribir texto en el editor no dispara ningún atajo de la página; undo/clear/Esc;
  cambiar color/grosor no altera lo ya dibujado; export descarga un PNG con banner correcto
  (título/URL/fecha, elipsado en URLs largas) y las anotaciones alineadas 1:1; Copy pega en un
  editor externo; las preferencias de estilo sobreviven recargas; la captura NO incluye la UI
  de Pixly ni los overlays de selección.
