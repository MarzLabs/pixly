# Herramienta: Distance Meter

## 1. Descripción

Mide distancias en píxeles arrastrando entre dos puntos de la página: muestra Δx, Δy y la
distancia en línea recta. Complemento del Image Overlay: el overlay en modo `difference` dice
_que_ algo está corrido; el medidor dice _cuánto_ — el número que va en el ticket.

## 2. User story

Como desarrollador verificando una implementación, quiero medir la distancia exacta en px entre
dos puntos o bordes de elementos, para reportar desviaciones concretas sin captura + editor de
imágenes.

## 3. Comportamiento

- **Scope `url`.** Las mediciones quedan visibles y persisten por página; recargar las restaura.
- **Múltiples mediciones:** cada drag agrega una medición a la lista (historial acotado a 20,
  FIFO — la más vieja cede lugar). Se borra una individual haciendo **clic en su etiqueta**
  (hover la pinta en rojo, `title` lo explica), o todas con "Clear all measurements". El estado
  legacy de medición única migra automáticamente a la lista.
- **Medir:** la herramienta activa muestra una superficie crosshair (fija al viewport). Drag de
  A a B pinta la línea verde (#30D158) con puntos en los extremos y una etiqueta en el punto
  medio: `320 × 48 · 323.6px` (Δx × Δy · distancia, un decimal).
- **Snap a bordes:** ambos extremos (inicial y final) se ajustan a los bordes del elemento bajo
  el cursor dentro de un **radio configurable** (0–50 px, default 8; 0 desactiva el snap y su
  feedback — control "Snap radius" en el panel). Cada eje se ajusta de forma independiente al
  borde más cercano. El elemento se detecta con `elementsFromPoint`, saltando el shadow host de
  Pixly.
- **Feedback de snap:** cuando un punto está pegándose a un borde, el elemento objetivo se
  resalta (caja con borde y relleno verde translúcido) con un **tag de identidad** estilo
  DevTools (`div#hero.container.mx-auto · 320×240`, máx. 2 clases, truncado a 48 chars; el tag
  se mete dentro de la caja si el elemento toca el tope del documento), y un punto hueco marca la
  posición exacta donde caerá el extremo. El feedback aparece en hover **antes de presionar** —
  así el snap del punto inicial es tan observable como el del final — y sigue al puntero durante
  el drag.
- **Ecos de snap persistentes:** cada medición guarda los rects de los elementos a los que se
  pegaron sus extremos (coordenadas de documento, persistidos con ella) y los dibuja como cajas
  punteadas mientras la medición exista — se ve _entre qué elementos_ va cada medida. Si ambos
  extremos se pegaron al mismo elemento se pinta una sola caja. Borrar una medición borra sus
  ecos; el saneamiento descarta ecos con rects inválidos.
- **Shift** bloquea el eje dominante (medición perfectamente horizontal/vertical).
- **Esc** cancela el gesto en curso (las mediciones ya commiteadas no se tocan); `pointercancel`
  y la pérdida de captura hacen lo mismo. Guardas completas anti gesto-zombie (regla del
  proyecto).
- **Tap sin arrastre** (< 3 px de recorrido) no agrega nada.
- **Pause** (toggle en el panel): la superficie deja de capturar — la página vuelve a ser
  interactiva — pero las figuras siguen visibles. Equivalente al Lock del overlay.
- **Figuras document-anchored:** líneas/puntos/etiquetas viven en coordenadas de documento y
  scrollean con el contenido medido; capa con tamaño en píxeles explícitos (host 0×0). La capa
  va después de la superficie en el DOM para que las etiquetas (con `pointer-events: auto`)
  reciban el clic de borrado por encima de ella.
- **Controles en vivo** (tab del rail): **listado de mediciones** (una fila por medición con su
  readout; clic en la fila hace scroll suave hasta ella, su botón × la elimina — útil cuando una
  medición quedó fuera del viewport), input de snap radius, toggle Pause, botón Clear all, hint
  de atajos.
- **Z-order:** bajo el toolbar, sobre reglas/overlay/grid (`toolbar > meter > rulers > overlay >
grid`), así se puede medir encima de cualquier otra capa de Pixly.

## 4. Fuera de alcance

- Medición automática de gaps entre elementos (estilo inspect-spacing de la v1).
- Unidades distintas a px, ángulos, o snapping a las guías/retícula de otras herramientas.
- Etiquetas o colores personalizados por medición.

## 5. Pruebas

- Unitarias (`tests/distance-geometry.test.ts`): defaults, saneamiento (NaN → null, redondeo),
  deltas 3-4-5 y simetría direccional, formato del readout, axis lock por eje dominante,
  snapping (dentro/fuera de radio, borde más cercano), largo/ángulo de línea y punto medio.
- Manuales: drag mide con readout en vivo; extremos se pegan a bordes de elementos; Shift
  bloquea el eje; Esc cancela restaurando la anterior; tap limpia; Pause devuelve la
  interactividad a la página conservando la figura; recarga restaura la medición (scope url);
  el rail muestra la cuarta tab.
