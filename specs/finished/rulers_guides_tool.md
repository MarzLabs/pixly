# Herramienta: Rulers & Guides

## 1. Descripción

Reglas de píxeles en los bordes de la página (superior e izquierda) más guías arrastrables que
persisten por página. Unifica en una sola herramienta lo que la v1 legacy tenía como dos
(_Rulers_ y _Free Guides_): las guías libres son simplemente guías con las reglas ocultas.

## 2. User story

Como desarrollador/diseñador verificando alineación, quiero marcar posiciones exactas en px con
guías que sobrevivan recargas, para comprobar que varios elementos comparten el mismo eje sin
volver a medir cada vez.

## 3. Comportamiento

- **Scope `url`:** las guías marcan posiciones de una página concreta.
- **Reglas:** dos canvas fijos al viewport (grosor 20 px) + esquina donde se cruzan. Ticks cada
  10 px, medios cada 50, mayores cada 100 con etiqueta numérica (rotada en la regla izquierda).
  Las etiquetas muestran **coordenadas de documento**: se redibujan al scrollear/resize
  (rAF-throttled, DPR-aware para nitidez en pantallas retina). Toggle "Show rulers" en el panel.
- **Guías:** líneas de 1 px (área de agarre de 5 px) en coordenadas de documento — scrollean con
  la página. Cyan (#00B4FF, estilo Photoshop) para distinguirse del grid rojo.
  - **Crear:** arrastrando desde una regla hacia la página (top → horizontal, izquierda →
    vertical), o con los botones "+ Vertical/Horizontal guide" (aparecen al centro del viewport).
  - **Mover:** drag con pointer capture y las cuatro guardas anti gesto-zombie (regla del
    proyecto: capture + pointercancel + lostpointercapture + buttons===0).
  - **Borrar:** soltando la guía sobre su regla de origen (gesto clásico de design tools), o
    "Clear guides" para todas. Un cancel/pérdida de captura NUNCA borra: conserva la posición.
  - **Readout:** mientras se arrastra, una etiqueta muestra `x: 342px` / `y: 128px`.
- **Render:** todo dentro del Shadow DOM, cero mutaciones a la página. Capa de guías con tamaño
  en píxeles explícitos (host 0×0 = containing block de tamaño cero). Z-order: bajo el toolbar,
  sobre el Image Overlay (las guías deben poder agarrarse encima de la imagen).
- **Saneamiento:** guías malformadas persistidas (eje inválido, posición NaN/negativa) se
  descartan; posiciones se redondean; posiciones se clampan al documento durante el drag.

## 4. Fuera de alcance

- Snapping de guías a bordes de elementos o a la retícula del Grid Overlay.
- Unidades distintas a px y cambio de origen (0,0 siempre es la esquina del documento).
- Guías con etiqueta/color personalizados.

## 5. Pruebas

- Unitarias (`tests/ruler-geometry.test.ts`): defaults, saneamiento de guías malformadas,
  alineación del primer tick al scroll, gradación de ticks, etiquetas solo en mayores, regla de
  borrado por drop en la regla de origen (y nunca en la opuesta), clamping/redondeo de posición.
- Manuales: activar → reglas visibles con números correctos al scrollear; arrastrar desde cada
  regla crea una guía con readout; soltar sobre la regla borra; recargar conserva las guías
  (scope url); ocultar reglas deja las guías; con Image Overlay activo las guías se agarran por
  encima de la imagen; el rail de la pill muestra la tercera tab.
