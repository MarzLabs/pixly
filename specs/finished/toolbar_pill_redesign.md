# Rediseño del toolbar in-page: pill minimizada, persistencia de UI y atajos

## 1. Descripción

Rediseño de la superficie de controles in-page de Pixly para que deje de estorbar durante la
comparación pixel-perfect. El panel flotante pasa de ser _opt-out_ (aparecía expandido y había que
quitarlo) a _opt-in_: por defecto es una **pill** minimizada y arrastrable, que se expande solo
cuando el usuario lo pide. La posición y el estado expandido/colapsado **persisten por origin**.

Complementos del mismo rediseño:

- **Split configuración vs. controles en vivo:** lo que se ajusta una vez (set-and-forget) vive en
  el popup; lo que se ajusta mirando la página vive en el widget in-page.
- **Rail de íconos:** el panel expandido muestra los controles de UNA herramienta a la vez,
  seleccionada en un rail de tabs, para que el footprint no crezca con el número de herramientas.
- **Auto-fade:** el widget se atenúa tras un periodo sin hover/focus y se restaura al instante.
- **Atajos de teclado** (`chrome.commands`) para las acciones de alta frecuencia.

Se descartó explícitamente `chrome.sidePanel` como superficie de controles: el side panel resta
ancho al viewport y cambiaría el layout de la página que se está comparando contra el diseño.

## 2. User stories

- **US-1:** Como usuario comparando un diseño contra la página, quiero que la UI de Pixly ocupe lo
  mínimo posible, para que no cubra los píxeles que estoy verificando.
- **US-2:** Como usuario, quiero que la posición donde dejé el widget y su estado
  (pill/expandido) se recuerden por sitio, para no reacomodarlo en cada recarga.
- **US-3:** Como usuario, quiero mostrar/ocultar el overlay y expandir/colapsar el toolbar con el
  teclado, para iterar sin abrir el panel.
- **US-4:** Como usuario, quiero configurar Fix Broken Images desde el popup, porque es una
  herramienta que se configura una vez y no necesita panel en la página.

## 3. Comportamiento

### 3.1 Widget in-page (pill ↔ panel)

- El widget aparece **solo** cuando al menos una herramienta activa expone controles en vivo
  (`renderControls`). Fix Broken Images ya no lo invoca.
- Estado por defecto: pill de 40 px acoplada a la esquina superior derecha.
- Clic en la pill → expande el panel. Botón «–» del header → vuelve a pill.
- Pill y panel se arrastran (Pointer Events + `setPointerCapture`); un press con desplazamiento
  ≤ 4 px cuenta como clic, no como drag.
- La posición se clampa al viewport (margen de 16 px) al arrastrar, al expandir y al redimensionar
  la ventana; si el viewport es más pequeño que el widget, gana la esquina superior izquierda.
- Auto-fade a opacidad 0.3 tras 2.5 s sin hover/focus; hover o focus lo restauran.

### 3.2 Persistencia (scope: origin)

- `PixlyConfig.toolbarUi[origin] = { position, expanded }` en `chrome.storage.local`.
- `position: null` significa la esquina por defecto; se fija al primer drag.
- Excepción de sesión: activar una herramienta con controles desde el popup expande el panel
  inmediatamente (intención explícita de usarla) **sin persistir** ese expand; tras recargar
  vuelve a mandar el estado persistido (pill por defecto). Navegar a otra URL limpia el override.

### 3.3 Rail de íconos

- Con más de una herramienta activa con controles, el panel muestra un rail de tabs (ícono por
  herramienta, `role="tab"`); se renderizan solo los controles de la seleccionada.
- Con una sola herramienta el rail se omite.

### 3.4 Configuración en el popup

- `ToolCatalogEntry.configFields` describe campos numéricos de forma declarativa
  (`key`, `label`, `kind`, `min`, `hint`). Fix Broken Images declara `minSizePx`.
- Los campos se muestran dentro de la tarjeta de la herramienta solo cuando está activa en el
  sitio; el popup escribe directo al documento de config.
- El orquestador detecta el cambio vía `storage.onChanged` y lo aplica a la herramienta viva con
  `restoreState` (guard de igualdad JSON para no ciclar con `persistState`). Fix Broken Images
  re-escanea al recibir un nuevo umbral.

### 3.5 Atajos de teclado

- `chrome.commands` (rebindables en `chrome://extensions/shortcuts`):
  - `Alt+Shift+P` — expandir/colapsar el toolbar (respeta las reglas de persistencia del clic).
  - `Alt+Shift+O` — mostrar/ocultar el overlay de imagen.
- El service worker reenvía el comando al content script del tab como `pixly/command`.
- In-page (overlay con focus, no locked): flechas = nudge 1 px (Shift = 10 px, ya existente);
  `[` / `]` = opacidad −/+ 5 %.

## 4. Fuera de alcance

- `chrome.sidePanel` como superficie de configuración (cambia el viewport; decisión documentada).
- Recordar la herramienta seleccionada del rail entre recargas.
- Revertir placeholders ya aplicados cuando `minSizePx` sube (paridad con el comportamiento
  anterior del control).

## 5. Pruebas

- Unitarias (`vitest`): clamping del widget y umbral de drag (`toolbar-geometry.test.ts`);
  persistencia de `toolbarUi` por origin y campos de config (`config-document.test.ts`);
  step de opacidad por teclado (`overlay-geometry.test.ts`).
- Manuales: pill visible solo con overlay activo; drag/expand/colapso persisten tras recarga;
  fade tras 2.5 s; atajos con el panel colapsado; `minSizePx` desde el popup re-escanea en vivo;
  esquinas: expandir una pill acoplada abajo-derecha reubica el panel dentro del viewport.
