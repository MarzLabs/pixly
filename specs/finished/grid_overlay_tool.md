# Herramienta: Grid Overlay

## 1. Descripción

Pinta una retícula de layout estilo Figma sobre la página real: columnas con gutter, márgenes
laterales, max-width opcional y baseline grid horizontal opcional. Complemento directo del Image
Overlay para verificar que la implementación respeta la retícula del diseño.

Todos sus controles son _en vivo_ (se ajustan mirando la página), así que viven en el widget
pill — es la segunda herramienta con tab en el rail, estrenando el caso multi-herramienta.

## 2. User story

Como desarrollador/diseñador verificando una implementación, quiero superponer la retícula del
diseño (columnas, gutters, márgenes, baseline) sobre la página real, para comprobar de un vistazo
que los elementos alinean a la grilla sin medir manualmente.

## 3. Comportamiento

- **Scope `origin`:** la retícula es del sitio; sobrevive recargas y navegación interna.
- **Render:** dentro del Shadow DOM (RF-CORE-2), cero mutaciones a la página. Nodo document-
  anchored (scrollea con el contenido), `pointer-events: none` (nunca bloquea la interacción),
  z-index bajo el Image Overlay y el toolbar. La altura se sincroniza con `scrollHeight` vía
  `ResizeObserver` + resize (contenido lazy incluido).
- **Estructura:** root (alto = documento) → frame (max-width centrado + padding lateral) →
  columnas (flex row con `gap` = gutter, un div por columna) + capa baseline
  (`repeating-linear-gradient` horizontal, línea de 1px cada N px).
- **Controles en vivo** (tab en el rail): columnas (1–24, default 12), gutter (0–400, default
  24), margen lateral (0–1000, default 0), max-width (0 = fluido —visible en el label—, default
  0; valores positivos se ajustan al mínimo usable de 200 px), opacidad (5–100%, default 15%),
  color (color picker, default #FF3B30 como Figma), toggle Baseline + tamaño de baseline (2–200,
  default 8) y toggle Hide (oculta sin desactivar).
- **Configs extremas siempre visibles:** las columnas nunca colapsan a 0 (`min-width: 1px`) y el
  frame recorta (`overflow: hidden`) en vez de derramar cuando los gutters exceden el ancho.
- **Saneamiento:** todos los valores persistidos se reparan a rangos válidos (clamp + round,
  color hex validado) en `activate`/`restoreState`/cada update.
- **Sin config en popup:** no declara `configFields`; el criterio del split se mantiene (todo
  aquí es live).

## 4. Fuera de alcance

- Grid de filas (rows) estilo Figma y grid cuadriculado uniforme.
- Múltiples retículas simultáneas por breakpoint (se ajusta a mano al cambiar el viewport).
- Snapping de otras herramientas a la retícula.

## 5. Pruebas

- Unitarias (`tests/grid-geometry.test.ts`): defaults, clamps de columnas/opacidad, reparación de
  NaN, validación de color hex, redondeo, gradiente del baseline (grosor constante, dirección),
  estilo del frame (fluido vs max-width + márgenes).
- Manuales: activar junto con Image Overlay → el rail muestra dos tabs; ajustar columnas/gutter
  se refleja al instante; el grid scrollea con la página y cubre todo el alto; Hide lo oculta;
  la página sigue 100% interactiva bajo el grid; recarga conserva la configuración (origin).
