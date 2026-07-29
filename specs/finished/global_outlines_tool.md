# Herramienta: Global Outlines

## 1. Descripción

Dibuja un outline alrededor de **todos** los elementos de la página para revelar la estructura
real del layout (cajas, anidamiento, elementos invisibles que ocupan espacio). Es el clásico
truco de debugging `* { outline: 1px solid }` convertido en herramienta con un toggle.

Primera herramienta nueva sobre la arquitectura v2: es 100% _set-and-forget_ (sin controles en
vivo), así que valida el camino config-en-popup / sin-widget-en-página, y estrena el kind
`select` en el esquema declarativo `configFields`.

## 2. User story

Como desarrollador revisando una implementación, quiero ver los límites de todas las cajas del
layout de un vistazo, para detectar contenedores mal anidados, márgenes colapsados o elementos
que ocupan espacio inesperado sin inspeccionar elemento por elemento.

## 3. Comportamiento

- **Scope `origin`:** se activa por sitio y sobrevive recargas y navegación interna (RF-ACT-2/4).
- **Mecánica:** inyecta UN `<style id="pixly-global-outlines-style">` en el documento. Es la
  única mutación de página; desactivar la herramienta lo elimina y la página queda intacta
  (RF-CORE-3). La re-inyección (MV3) reemplaza el nodo, nunca lo duplica.
- **Modos de color** (config `colorMode`):
  - `by-depth` (default): cada nivel de anidamiento DOM recibe un color de una paleta de 8
    tonos, ciclada hasta 12 niveles. Implementado con selectores universales encadenados
    (`*`, `* *`, `* * *`…): a igual especificidad gana la última regla que matchea, o sea la
    del nivel más profundo del elemento.
  - `single`: un solo color fijo (#FF2D95) para todos los elementos.
- **Ancho** (config `widthPx`, default 1, mínimo 1): grosor del outline en px.
- Se usa `outline` y no `border` precisamente porque no afecta el layout de la página.
- **`!important` deliberado:** las páginas suelen resetear outlines (`* { outline: none }`); una
  herramienta de debug debe ganar sobre esos resets. Efecto conocido: mientras está activa,
  también pisa los outlines de focus del sitio.
- **Exclusión propia:** el shadow host de Pixly (`#pixly-shadow-host`) nunca se outlinea.
- **Config en popup:** ambos campos viven en la tarjeta del popup (visibles con la herramienta
  activa); los cambios llegan a la herramienta viva vía `restoreState` y reescriben el stylesheet
  al instante.
- **Saneamiento:** estados persistidos corruptos (ancho ≤ 0, modo desconocido) se reparan a
  defaults en `activate`/`restoreState`.

## 4. Fuera de alcance

- Color personalizable para el modo `single` (requeriría un kind `color` en configFields).
- Outline solo de un subárbol/selector específico.
- Diferenciar block/inline/flex/grid por color (posible evolución del modo `by-depth`).

## 5. Pruebas

- Unitarias (`tests/outline-css.test.ts`): defaults, saneamiento (ancho inválido, modo
  desconocido, redondeo), regla única en modo single, una regla por nivel hasta el cap, orden
  shallow→deep del cascade, ciclado de paleta, exclusión del shadow host, presencia de
  `!important`. Más lectura/escritura de valores string en `config-document.test.ts`.
- Manuales: activar en un sitio real → outlines visibles de inmediato; cambiar ancho y modo desde
  el popup → el cambio se aplica en vivo; recargar → sigue activa (scope origin); desactivar →
  la página queda exactamente como antes; el widget pill NO aparece si es la única herramienta
  activa.
