# Capture & Annotate: modo Page (captura de página completa)

## 1. Descripción

Cuarto modo de captura para Capture & Annotate: **Page** hace scroll por toda la página,
fotografía cada parada del viewport y cose las franjas en un solo bitmap alto que abre en el
mismo editor de anotaciones de siempre. Levanta el "fuera de alcance" de scroll & stitch del
spec original (`capture_annotate_tool.md`): reportar un bug que involucra contenido por debajo
del fold ya no obliga a capturar por pedazos.

## 2. User story

Como desarrollador o QA reportando un problema en una página larga, quiero capturar la página
COMPLETA de arriba a abajo en una sola imagen anotable, para señalar problemas que involucran
contenido fuera del viewport (o la relación entre secciones lejanas) sin coser capturas a mano.

## 3. Comportamiento

- **Botón "Page"** en el panel, entre View y Area. Mismo ciclo de vida que los demás modos:
  deshabilitado mientras hay captura, pick o editor activos; el resultado abre el editor y el
  export lleva el banner de procedencia habitual.
- **Plan de scroll puro** (`scroll-plan.ts`, sin DOM): offsets de scroll de a un viewport,
  con la última parada clampeada para que la franja final quede al ras del fondo (se superpone
  con la anterior en vez de pasarse — la página tampoco puede scrollear más allá). El alto
  total en píxeles de dispositivo se acota a `MAX_STITCH_DEVICE_HEIGHT_PX` (16384, el límite
  práctico del canvas 2D de Chrome); una página más alta se **trunca** y el feedback lo dice.
  Una página que cabe en el viewport colapsa a una sola franja (equivale a View).
- **Orquestación** (`scroll-capture.ts`): se scrollea `document.scrollingElement` con
  `behavior: 'instant'`, se espera doble rAF + settle (200 ms) para que pinte el contenido
  lazy, y se pide la franja al service worker reutilizando `pixly/capture-visible-tab` (sin
  cambios en el manifest ni en el service worker). Las llamadas a `captureVisibleTab` van
  espaciadas ≥600 ms (cuota de Chrome ~2/seg) con un reintento por franja tras 1 s si la cuota
  igual salta. La posición real alcanzada (`scrollTop` leído tras el settle) dicta dónde se
  pinta cada franja; la primera franja define la escala real de captura (zoom del navegador
  incluido) y dimensiona el canvas de stitching (`OffscreenCanvas` →
  `transferToImageBitmap()`).
- **Chrome de página sin repetir:** los elementos `position: fixed` (headers flotantes, FABs,
  banners de cookies) se ocultan (`visibility: hidden`, conserva layout) a partir de la
  SEGUNDA franja — la primera los conserva, como una captura normal — y los `position: sticky`
  se pasan a `static` durante toda la corrida (layout idéntico al de un sticky sin pegar), así
  aparecen exactamente una vez, en su posición de flujo. Los estilos inline registrados se
  restauran al final pase lo que pase, igual que la posición de scroll original.
- **Cancelación:** desactivar la herramienta a mitad de corrida aborta el walk (se sondea
  entre pasos async), restaura página y scroll, y no abre nada. La UI de Pixly permanece
  oculta (host `visibility: hidden`) durante toda la corrida, así que jamás sale en ninguna
  franja.
- **Editor y export sin cambios:** el bitmap alto entra por el mismo camino que los demás
  modos (el stage del editor ya scrollea con `overflow: auto`), y el export compone el banner
  de procedencia sobre la imagen completa.

## 4. Fuera de alcance

- Contenedores de scroll anidados (la página scrollea en un div interno): el plan colapsa a
  una franja y degrada a una captura del viewport.
- Scroll horizontal (solo se recorre el eje vertical).
- Partir páginas más altas que el tope en múltiples imágenes (se trunca y se avisa).
- Ocultar la barra de scroll o el chrome sticky "a medias" (un sticky pegado a mitad de su
  contenedor puede quedar en su posición de flujo, no donde se veía).

## 5. Pruebas

- Unitarias (`tests/scroll-plan.test.ts`): página que cabe en el viewport → una franja;
  pasos de a un viewport con última parada al ras del fondo; sin parada duplicada cuando la
  página es múltiplo exacto; paso corto final para páginas apenas más altas; truncado por el
  tope de píxeles de dispositivo (escalado por dpr) con la última franja dentro del total;
  cobertura completa exactamente en el tope; dpr no positivo → 1; y el mapeo de offset de
  franja (escala por dpr real, clamp al fondo del canvas, nunca negativo, escala no positiva
  → 1).
- Manuales: en una página larga (p. ej. un changelog), Page recorre y abre el editor con la
  página entera nítida y sin costuras visibles; el header fijo aparece solo arriba y el sticky
  una sola vez; la posición de scroll queda donde estaba; en una página corta equivale a View;
  en una página más alta que el tope el feedback avisa del recorte; desactivar la herramienta
  a mitad de corrida restaura la página sin abrir el editor; el export descarga el PNG alto
  con el banner y las anotaciones alineadas 1:1.
