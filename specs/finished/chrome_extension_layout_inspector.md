# Extensión de Chrome para inspección y comparación visual de layouts (Figma vs. implementación)

## Nombre de la extensión

Pixly

## Descripción general

Esta especificación describe una extensión para el navegador Chrome cuyo propósito es facilitar el trabajo de comparación visual entre la implementación web actual de una página y el diseño original creado en Figma. La extensión está orientada a desarrolladores frontend, diseñadores y revisores de QA visual, brindando un conjunto de utilidades que permiten resaltar elementos del DOM, aplicar colores temporales, medir distancias entre elementos, inspeccionar propiedades tipográficas y de color, y superponer imágenes del diseño original para comparaciones pixel-perfect.

El problema que resuelve es la fricción que existe al validar visualmente que una implementación coincide con su diseño de referencia. Hoy en día, este proceso requiere abrir las DevTools de Chrome, hacer mediciones manuales, capturar pantallazos, alternar entre Figma y el navegador, y aplicar estilos temporales mediante el inspector. La extensión consolida estas tareas en una herramienta sencilla, accesible desde la propia página web, sin necesidad de abrir paneles avanzados del navegador.

El valor que aporta es la reducción del tiempo de revisión visual, la posibilidad de detectar diferencias de espaciado, color y tipografía de forma inmediata, y la mejora de la comunicación entre el equipo de diseño y desarrollo al contar con evidencia visual rápida de cualquier discrepancia. Adicionalmente, permite tomar decisiones más informadas durante revisiones de diseño y QA visual.

## Estructura por etapas

El producto se construirá en dos etapas claramente delimitadas. Cada etapa es autocontenida y aporta valor por sí misma:

- **Etapa 1 — Herramientas de inspección y medición**: Todo lo necesario para inspeccionar, medir, resaltar y capturar información del DOM existente en la página.
- **Etapa 2 — Superposición de imagen de Figma**: Funcionalidades específicas para superponer una imagen de referencia del diseño original y compararla visualmente con la implementación.

> Nota técnica importante: en toda la especificación, cuando se habla de "resaltar" un elemento, "marcarlo" o "aplicar un contorno", se hace referencia al uso de `outline` y NO de `border`. La razón es que `border` afecta el box model del elemento y desplaza el layout, mientras que `outline` se dibuja por fuera sin alterar dimensiones ni la disposición del resto de los elementos, lo cual es indispensable para una herramienta de inspección no intrusiva. El término "border" solo se usa cuando la extensión inspecciona el `border` real (CSS computado) de un elemento, no cuando aplica un resaltado visual propio.

---

# Etapa 1 — Herramientas de inspección y medición

## Descripción de la etapa

La Etapa 1 cubre el corazón funcional de la extensión: el conjunto de herramientas que permiten al usuario inspeccionar visualmente la página, medir distancias, capturar propiedades CSS, resaltar elementos y aplicar configuraciones temporales sin necesidad de abrir DevTools. Es la base sobre la cual se podrá agregar luego la comparación con imágenes externas.

## User stories

- Como **desarrollador frontend**, quiero pasar el cursor sobre cualquier elemento de la página y ver inmediatamente sus dimensiones y distancias hacia elementos adyacentes, para verificar que mi implementación respeta el espaciado del diseño original.
- Como **revisor de QA visual**, quiero aplicar colores de fondo o contorno (outline) de manera rápida a elementos específicos, para diferenciar bloques visualmente durante una sesión de revisión.
- Como **desarrollador frontend**, quiero ver la información tipográfica y de color de un elemento al hacer hover, sin tener que abrir DevTools, para comparar de forma ágil con las especificaciones de Figma.
- Como **diseñador**, quiero medir la distancia exacta entre dos elementos cualesquiera de la página, para verificar alineaciones que no son evidentes a simple vista.
- Como **desarrollador frontend**, quiero capturar todas las propiedades CSS relevantes de un elemento con un solo click, para reportar discrepancias a mi equipo o copiarlas a documentación.
- Como **revisor de QA visual**, quiero crear reglas y guías arrastrables en la página para validar alineaciones que no son obvias a simple vista.
- Como **diseñador**, quiero ampliar visualmente un área específica de la página mediante una lupa, para detectar diferencias finas de pixeles sin tener que hacer zoom al navegador.

## Criterios de aceptación

1. La extensión se instala desde Chrome y queda disponible mediante un icono en la barra de herramientas del navegador.
2. Al hacer click en el icono de la extensión se muestra un panel (popup) con controles para activar y desactivar cada funcionalidad de inspección de la Etapa 1.
3. Las funcionalidades de inspección solo afectan visualmente la pestaña activa y no modifican el código fuente real de la página.
4. Al recargar la página, todos los efectos visuales aplicados por la extensión se limpian automáticamente.
5. La extensión funciona en cualquier sitio web público sin requerir permisos de la página visitada más allá de los permisos estándar de una extensión de inspección visual.
6. Las funcionalidades pueden activarse y desactivarse de forma individual; varias pueden estar activas simultáneamente cuando es lógicamente compatible.
7. La extensión incluye atajos de teclado para alternar las funcionalidades principales sin necesidad de abrir el popup.
8. Todos los textos visibles de la extensión (popup, tooltips, mensajes) están disponibles en español.
9. La extensión no genera errores en la consola del navegador ni interfiere con el funcionamiento normal de la página inspeccionada.
10. El usuario puede salir del modo de inspección en cualquier momento presionando la tecla `Escape`.
11. Cualquier resaltado visual sobre un elemento se aplica mediante `outline` (u otra técnica que no altere las dimensiones del elemento), nunca mediante `border`.
12. Las configuraciones del usuario (paleta de colores, atajos, preferencias) persisten entre sesiones del navegador.

## Happy paths

### Escenario 1: Hover con resaltado y medidas visibles
1. El usuario hace click en el icono de la extensión y activa la funcionalidad "Inspector de elementos".
2. El usuario mueve el cursor sobre la página y se posa sobre un elemento (por ejemplo, una tarjeta de producto).
3. El elemento se resalta con un outline y/o relleno semitransparente que indica claramente sus límites sin alterar su disposición.
4. Junto al elemento aparece un tooltip que muestra el nombre del tipo de elemento (div, button, section, etc.), sus dimensiones (ancho x alto) y, opcionalmente, su selector descriptivo.
5. Líneas y números indican las distancias del elemento hacia los elementos adyacentes superior, inferior, izquierdo y derecho (por ejemplo, "12px", "24px"), reflejando margin, padding o gap según corresponda.
6. Al mover el cursor a otro elemento, las medidas se actualizan automáticamente.

### Escenario 2: Aplicar color de fondo a un elemento
1. Con el inspector activo, el usuario selecciona en el popup (o desde un mini-panel flotante) un color desde una paleta predefinida o personalizada.
2. El usuario hace hover sobre el elemento al que desea aplicar el color.
3. El usuario hace click manteniendo presionada una tecla modificadora (por ejemplo, `Shift`) o usa el atajo configurado para aplicar el color.
4. El elemento adquiere el color de fondo seleccionado de manera visual e inmediata.
5. El usuario puede aplicar colores distintos a diferentes elementos para diferenciarlos durante la revisión.

### Escenario 3: Aplicar color de outline (contorno) a un elemento
1. Con el inspector activo, el usuario selecciona un color y elige la opción "Aplicar como contorno".
2. El usuario hace hover sobre el elemento y dispara el atajo correspondiente (por ejemplo, `Ctrl+Shift+B`).
3. El elemento muestra un outline del color seleccionado, sin alterar su tamaño ni la disposición del resto de la página.
4. El usuario puede repetir la acción en múltiples elementos.

### Escenario 4: Inspector tipográfico
1. El usuario activa la funcionalidad "Inspector tipográfico" desde el popup.
2. Al hacer hover sobre cualquier elemento que contenga texto, aparece un tooltip o panel flotante con la siguiente información:
   - Familia tipográfica (font-family)
   - Tamaño de fuente (font-size)
   - Altura de línea (line-height)
   - Espaciado entre letras (letter-spacing)
   - Peso de la fuente (font-weight)
   - Color del texto (en formato hex y rgb)
3. El usuario puede copiar cualquier valor al portapapeles haciendo click sobre él.

### Escenario 5: Inspector de colores
1. El usuario activa "Inspector de colores".
2. Al hacer hover sobre un elemento, se muestra el color de fondo del elemento en formato hex y rgb.
3. El usuario hace click en el valor del color para copiarlo al portapapeles.
4. Una notificación breve confirma que el color fue copiado.

### Escenario 6: Reglas y guías visuales
1. El usuario activa la opción "Reglas y guías".
2. El usuario hace click en un punto de la página y arrastra para crear una línea guía horizontal o vertical.
3. La línea queda fija en la página y sirve como referencia visual.
4. El usuario puede crear múltiples guías y arrastrarlas para reposicionarlas.
5. El usuario puede eliminar guías individuales haciendo click derecho sobre ellas, o limpiarlas todas desde el popup.

### Escenario 7: Medición de distancia entre dos elementos
1. El usuario activa "Medir distancia entre elementos".
2. El usuario hace click sobre un primer elemento; el elemento queda marcado como referencia A.
3. El usuario hace click sobre un segundo elemento; el elemento queda marcado como referencia B.
4. La extensión muestra líneas y valores que indican la distancia horizontal, vertical y diagonal entre los bordes y centros de A y B.
5. El usuario puede limpiar la medición y elegir nuevos elementos.

### Escenario 8: Grid overlay configurable
1. El usuario activa la opción "Grid overlay" en el popup.
2. El usuario configura los parámetros del grid:
   - Número de columnas
   - Ancho del gutter (separación entre columnas)
   - Ancho máximo del contenedor
   - Color de las columnas
   - Opacidad del grid
3. El grid se muestra superpuesto sobre la página y se centra automáticamente respecto al viewport.
4. El usuario puede ocultar y mostrar el grid con un atajo de teclado.

### Escenario 9: Toggle de outlines globales
1. El usuario activa "Outlines globales".
2. Todos los elementos visibles de la página adquieren un outline fino que delimita sus límites sin desplazar el layout.
3. El usuario puede filtrar por tipo de elemento (div, section, button, img, etc.) para mostrar outlines solamente en ciertos tipos.
4. El usuario desactiva la funcionalidad y los outlines desaparecen.

### Escenario 10: Modo "inspect spacing"
1. El usuario activa "Inspect spacing".
2. Todos los elementos de la página muestran su padding y margin resaltados con colores tipo Figma (por ejemplo, verde para padding, naranja para margin).
3. El usuario puede inspeccionar visualmente toda la jerarquía de espaciados de la página.

### Escenario 11: Capturar especificaciones de un elemento
1. El usuario activa "Capturar especificaciones".
2. El usuario hace click sobre un elemento.
3. Aparece un panel flotante con las propiedades CSS más relevantes del elemento:
   - Dimensiones (width, height)
   - Espaciado (padding, margin)
   - Tipografía (font-family, font-size, line-height, letter-spacing, font-weight, color)
   - Fondo (background-color, background-image)
   - Bordes reales del CSS del elemento (border, border-radius)
   - Sombras (box-shadow)
   - Posicionamiento (display, position, top, right, bottom, left, z-index)
4. El usuario hace click en "Copiar todo" para llevar las propiedades al portapapeles en formato listo para pegar (por ejemplo, en un comentario o ticket).

### Escenario 12: Zoom y lupa
1. El usuario activa la funcionalidad "Lupa".
2. Al mover el cursor por la página, una ventana flotante muestra una vista ampliada del área alrededor del cursor.
3. El usuario puede ajustar el nivel de zoom (por ejemplo, 2x, 4x, 8x).
4. El usuario desactiva la lupa con un atajo o desde el popup.

### Escenario 13: Configuración de paleta de colores rápidos
1. El usuario abre la sección de configuración del popup.
2. El usuario ve la paleta predefinida de colores.
3. El usuario puede agregar colores personalizados (mediante selector de color o ingresando valor hex).
4. El usuario puede eliminar colores existentes y reordenarlos.
5. La paleta queda guardada para sesiones futuras (persistencia entre sesiones del navegador).

### Escenario 14: Uso de atajos de teclado
1. El usuario activa la extensión.
2. Sin abrir el popup, el usuario presiona el atajo de teclado configurado (por ejemplo, `Alt+I` para activar el inspector de elementos).
3. La funcionalidad se activa o desactiva según corresponda.
4. El usuario puede ver y modificar los atajos desde la configuración del popup.

### Escenario 15: Limpieza al recargar la página
1. El usuario aplica varios colores de fondo y outlines a elementos durante una sesión de revisión.
2. El usuario recarga la página (F5 o Ctrl+R).
3. Todos los efectos visuales aplicados por la extensión desaparecen.
4. La página vuelve a su estado original.
5. Las configuraciones del usuario (paleta personalizada, atajos, preferencias) persisten.

## Sad paths

### Escenario 1: La página tiene restricciones de seguridad (CSP estricta)
1. El usuario intenta activar el inspector sobre una página con políticas de seguridad de contenido muy estrictas.
2. Si la extensión no logra inyectar sus controles visuales, debe notificar al usuario mediante una alerta en el popup indicando que la página actual no soporta la inspección.
3. El icono de la extensión muestra un estado visual de "no disponible".

### Escenario 2: Hover sobre un elemento no inspeccionable
1. El usuario hace hover sobre un elemento que no puede ser inspeccionado (por ejemplo, dentro de un iframe cross-origin).
2. La extensión muestra un tooltip indicando: "Este elemento pertenece a un iframe externo y no puede ser inspeccionado."

### Escenario 3: Conflicto entre funcionalidades simultáneas
1. El usuario activa dos funcionalidades que se solapan visualmente (por ejemplo, "Outlines globales" y "Inspect spacing").
2. La extensión muestra una advertencia indicando que la combinación puede dificultar la lectura visual y sugiere desactivar una.
3. Si el usuario decide continuar, ambas funcionalidades operan, pero la extensión prioriza visualmente la activada más recientemente.

### Escenario 4: Atajo de teclado en conflicto con la página o el navegador
1. El usuario configura un atajo que el navegador o la página ya utiliza.
2. La extensión detecta el conflicto al guardar la configuración y muestra un mensaje: "El atajo seleccionado entra en conflicto con un atajo existente. Por favor elige otra combinación."

### Escenario 5: Color personalizado inválido
1. En la configuración de la paleta, el usuario ingresa un valor que no es un color válido (por ejemplo, "abc123" sin `#` o un texto arbitrario).
2. La extensión valida el formato y muestra un mensaje: "El valor ingresado no es un color válido. Usa el formato hex (por ejemplo, #FF5733) o un selector de color."

### Escenario 6: Página sin contenido relevante para inspeccionar
1. El usuario activa el inspector en una página vacía o con muy poco contenido.
2. La extensión funciona normalmente, pero no muestra medidas o información significativa porque no hay elementos sobre los que hacer hover.
3. No se muestra error; simplemente no hay datos que reportar.

### Escenario 7: Lupa sobre elementos con animaciones intensas
1. El usuario activa la lupa sobre una zona con animaciones constantes (por ejemplo, un carrusel automático).
2. La lupa se actualiza en cada frame; si el rendimiento se degrada visiblemente, la extensión sugiere desactivar la lupa.

### Escenario 8: Intento de aplicar color sin elemento seleccionado
1. El usuario presiona el atajo para aplicar color de fondo, pero no está haciendo hover sobre ningún elemento.
2. La extensión no realiza ninguna acción y muestra un mensaje breve: "Pasa el cursor sobre un elemento antes de aplicar el color."

### Escenario 9: Página dinámica con cambios constantes de DOM
1. El usuario está midiendo distancias en una página donde el DOM cambia constantemente (por ejemplo, un dashboard en tiempo real).
2. La extensión actualiza las mediciones en tiempo real conforme se mueve el cursor.
3. Si el elemento medido desaparece, la medición se limpia automáticamente y se notifica brevemente al usuario.

### Escenario 10: Aplicar resaltado en un elemento con `outline` propio
1. El usuario aplica un outline mediante la extensión sobre un elemento que ya tiene un `outline` definido en su CSS (por ejemplo, un input con foco).
2. La extensión muestra su outline como prioridad visual y, al limpiar el resaltado, restaura el outline original del elemento sin alterarlo.
3. Si no es posible distinguir ambos contornos, la extensión usa un grosor o color claramente diferenciado.

## Reglas de negocio

1. La extensión nunca modifica el DOM persistente de la página; todas las anotaciones visuales (resaltados, outlines, colores aplicados, reglas) se manejan como una capa visual independiente.
2. Cualquier resaltado o marcado de elementos generado por la extensión debe aplicarse con `outline` (u otra técnica equivalente que no altere dimensiones), nunca con `border`. La razón es que `border` desplaza el layout y afectaría la fidelidad de la inspección.
3. Al recargar la página, todas las modificaciones visuales temporales se limpian automáticamente.
4. Las configuraciones del usuario (paleta de colores, atajos, preferencias por defecto) persisten entre sesiones del navegador.
5. La extensión funciona solo en la pestaña activa donde fue activada; no afecta otras pestañas.
6. La extensión respeta la jerarquía del DOM al calcular distancias y propiedades; los valores mostrados deben reflejar fielmente los estilos computados del elemento, no estilos heredados ambiguos.
7. Los colores se muestran siempre en al menos dos formatos: hexadecimal y RGB, con opción a copiar cualquiera.
8. Los tooltips y paneles flotantes nunca obstruyen permanentemente el contenido inspeccionado; se reposicionan automáticamente si están demasiado cerca de los bordes de la ventana.
9. La extensión debe distinguir entre elementos visibles e invisibles (por ejemplo, elementos con `display: none` o `visibility: hidden`) y evitar interactuar con elementos invisibles.
10. Al aplicar un color de fondo o un outline, el cambio debe ser visualmente reversible: el usuario puede deshacer la última acción con un atajo o limpiarlo todo con un botón en el popup.
11. La extensión funciona en cualquier resolución de pantalla; los elementos del UI (tooltips, paneles) son responsivos.
12. Los atajos de teclado deben ser configurables y la extensión debe ofrecer un conjunto de atajos por defecto sensatos (que no entren en conflicto con atajos comunes del navegador).
13. El usuario puede salir de cualquier modo de inspección presionando `Escape`.
14. La extensión muestra siempre un indicador visual claro (por ejemplo, un cambio de color en el icono de la extensión) cuando hay alguna funcionalidad activa.
15. Las medidas se muestran en píxeles por defecto; opcionalmente, el usuario puede cambiar la unidad a rem o em desde la configuración.
16. La paleta de colores rápidos tiene un tamaño máximo razonable (por ejemplo, 20 colores) para mantener la UI manejable.
17. Al inspeccionar el `border` real (CSS computado) de un elemento, la extensión sí debe mostrar fielmente el valor del border declarado en su CSS, sin confundirlo con el outline aplicado por la extensión.

## Cómo debe probarse (Etapa 1)

### Pruebas unitarias

- Cálculo de distancias entre dos elementos a partir de sus coordenadas (verificación matemática de horizontal, vertical y diagonal).
- Conversión entre formatos de color (hex a rgb, rgb a hex, validación de formato).
- Validación de valores ingresados en la configuración de paleta (color hex válido, longitud, formato).
- Lógica de detección de conflictos entre atajos de teclado.
- Cálculo de posición de tooltips y paneles para que no se salgan del viewport.
- Lógica de filtrado de elementos por tipo (div, section, button, etc.) cuando se aplican outlines globales.
- Lógica de captura y formateo de especificaciones CSS de un elemento para el portapapeles.

### Pruebas de funcionalidad (feature tests)

- Activar el inspector y hacer hover sobre un elemento debe mostrar el resaltado y las medidas, aplicando el resaltado mediante `outline`, sin desplazar el layout.
- Aplicar un color de fondo a un elemento debe modificarlo visualmente sin afectar a otros elementos.
- Aplicar un outline (contorno) a un elemento no debe alterar el tamaño del elemento ni la disposición de los elementos adyacentes.
- Configurar un grid con columnas específicas y verificar que el grid se renderiza correctamente sobre la página.
- Medir la distancia entre dos elementos seleccionados debe mostrar valores consistentes con las posiciones reales.
- Recargar la página debe limpiar todas las modificaciones visuales aplicadas por la extensión.
- Activar y desactivar funcionalidades mediante atajos de teclado debe funcionar sin necesidad de abrir el popup.
- Las configuraciones del usuario deben persistir entre sesiones del navegador (paleta, atajos, preferencias).
- Capturar las especificaciones de un elemento y copiarlas al portapapeles debe producir un texto correctamente formateado.
- Aplicar y luego limpiar un outline sobre un elemento que tenía outline propio en CSS debe restaurar el estado original del elemento.

### Pruebas manuales

- Verificar que el resaltado y los tooltips no obstruyen visualmente el contenido inspeccionado.
- Comprobar que los colores aplicados son fácilmente distinguibles entre sí (contraste, saturación).
- Validar la usabilidad de los controles del popup: que sean intuitivos, accesibles y respondan rápidamente.
- Probar la extensión en sitios web con layouts complejos (e-commerce, dashboards, landing pages, sitios con animaciones).
- Validar la legibilidad de los textos en tooltips y paneles flotantes en distintas combinaciones de color de fondo.
- Comprobar que las funcionalidades simultáneas (por ejemplo, outlines globales + grid overlay) coexisten sin problemas visuales graves.
- Probar la lupa en diferentes niveles de zoom para asegurar nitidez razonable.
- Verificar que los atajos de teclado funcionan en distintos sistemas operativos (Windows, macOS, Linux).
- Probar el comportamiento de la extensión en sitios con scroll infinito, lazy loading o contenido cargado dinámicamente.
- Verificar la accesibilidad básica del popup (navegación con teclado, contraste de colores, foco visible).
- Verificar visualmente que en ningún caso el resaltado de la extensión desplaza el contenido de la página (validación crítica del cambio de `border` a `outline`).

---

# Etapa 2 — Superposición de imagen de Figma

## Descripción de la etapa

La Etapa 2 agrega la capacidad de superponer una imagen de referencia del diseño original (típicamente un export de Figma) sobre la página implementada para hacer comparaciones visuales precisas. Esta etapa depende de la Etapa 1 únicamente en cuanto a infraestructura general de la extensión (popup, persistencia de configuraciones, atajos de teclado), pero las funcionalidades aquí descritas son completamente independientes de las herramientas de inspección.

Esta etapa permite al usuario validar de un solo vistazo si la implementación coincide con el diseño, ajustando opacidad, alineación y modos de mezcla para detectar discrepancias visuales.

## User stories

- Como **diseñador**, quiero superponer una imagen del diseño de Figma sobre la página implementada con opacidad ajustable, para comparar visualmente las diferencias entre ambos.
- Como **desarrollador frontend**, quiero alternar rápidamente entre la vista con overlay y sin overlay para identificar diferencias entre la implementación y el diseño.
- Como **revisor de QA visual**, quiero tomar una captura de la página implementada y compararla lado a lado con la imagen del diseño, para documentar discrepancias.
- Como **diseñador**, quiero aplicar modos de mezcla (por ejemplo "difference") al overlay para que las diferencias entre diseño e implementación queden visualmente resaltadas.

## Criterios de aceptación

1. El usuario puede cargar una imagen desde su computadora para superponerla sobre la página actual.
2. La imagen se muestra como una capa visual independiente sobre la página, sin alterar el DOM real ni el código fuente.
3. La opacidad del overlay es ajustable por el usuario en un rango de 0% a 100%.
4. La imagen del overlay puede arrastrarse para alinearla con la implementación.
5. El usuario puede activar y desactivar el overlay con un atajo de teclado.
6. La imagen cargada nunca se sube a un servidor remoto; permanece en la sesión local del usuario.
7. Al recargar la página, el overlay se limpia automáticamente (al igual que las demás herramientas visuales).
8. La extensión soporta formatos de imagen comunes (PNG, JPG, WEBP, SVG) y rechaza otros formatos con un mensaje claro.
9. Existe un tamaño máximo de imagen aceptado y, si se excede, se informa al usuario.
10. La extensión ofrece al menos un modo de comparación que facilite detectar diferencias visuales (por ejemplo, modo "difference" o inversión de colores).
11. El usuario puede tomar un snapshot de la página implementada para compararla lado a lado con la imagen de referencia.

## Happy paths

### Escenario 1: Cargar y superponer una imagen de Figma
1. El usuario abre el popup y selecciona la opción "Superponer imagen de diseño".
2. El usuario carga una imagen desde su computadora (por ejemplo, un export PNG del diseño de Figma).
3. La imagen aparece superpuesta sobre la página actual.
4. El usuario ajusta la opacidad mediante un control deslizante (de 0% a 100%).
5. El usuario puede arrastrar la imagen para alinearla con la implementación.
6. El usuario puede activar y desactivar el overlay con un atajo de teclado para comparar rápidamente.

### Escenario 2: Aplicar modo de mezcla para resaltar diferencias
1. El usuario tiene un overlay activo sobre la página.
2. Selecciona un modo de comparación visual en el popup (por ejemplo, "difference" o "inversión de colores").
3. La extensión aplica el modo seleccionado y las diferencias entre diseño e implementación quedan visualmente resaltadas.
4. El usuario puede volver al modo de opacidad simple en cualquier momento.

### Escenario 3: Reposicionar y ajustar el overlay
1. El usuario tiene un overlay cargado pero desalineado respecto a la implementación.
2. El usuario arrastra la imagen con el cursor.
3. La imagen se mueve en tiempo real y queda en la nueva posición al soltar el cursor.
4. El usuario ajusta la opacidad para verificar el alineamiento.

### Escenario 4: Snapshot y comparación lado a lado
1. El usuario activa "Snapshot y comparación".
2. El usuario captura una imagen de la página actual (botón "Tomar screenshot").
3. El usuario carga una imagen del diseño de Figma.
4. Se muestra una vista lado a lado de ambas imágenes con la posibilidad de hacer zoom sincronizado.
5. El usuario puede alternar entre vista lado a lado, vista superpuesta y vista de diferencias.

### Escenario 5: Alternar overlay con atajo de teclado
1. El usuario tiene un overlay activo y configurado.
2. Presiona el atajo configurado (por ejemplo, `Alt+O`).
3. El overlay se oculta; el usuario ve la implementación pura.
4. Presiona el atajo nuevamente y el overlay reaparece con la misma posición y opacidad.

### Escenario 6: Persistencia temporal del overlay al cambiar de pestaña
1. El usuario tiene un overlay de imagen activo y cambia de pestaña.
2. Al regresar a la pestaña original, el overlay sigue activo con la última posición y opacidad configuradas.
3. El usuario puede continuar trabajando sin tener que recargar la imagen.

## Sad paths

### Escenario 1: Imagen con formato no soportado
1. El usuario intenta cargar un archivo que no es una imagen válida (por ejemplo, un PDF o un archivo de texto).
2. La extensión rechaza el archivo y muestra un mensaje claro: "Formato no soportado. Por favor selecciona una imagen en formato PNG, JPG, WEBP o SVG."

### Escenario 2: Imagen demasiado grande
1. El usuario intenta cargar una imagen que supera el tamaño máximo permitido (por ejemplo, mayor a 20 MB).
2. La extensión rechaza la carga y muestra un mensaje: "La imagen excede el tamaño máximo permitido de 20 MB. Por favor reduce el tamaño y vuelve a intentarlo."

### Escenario 3: Imagen con dimensiones que no coinciden con la página
1. El usuario carga una imagen significativamente más pequeña o más grande que el viewport de la página.
2. La extensión muestra una notificación informativa: "La imagen tiene un tamaño distinto al viewport. Puedes arrastrarla o ajustar su tamaño para alinearla."
3. El usuario puede redimensionar la imagen mediante controles de escala o ajustarla al ancho del viewport con un botón rápido.

### Escenario 4: Pérdida del overlay al cerrar la pestaña
1. El usuario tiene un overlay activo y cierra la pestaña.
2. Al abrir una nueva pestaña con la misma URL, el overlay no se restaura automáticamente.
3. El usuario debe volver a cargar la imagen.

### Escenario 5: La página tiene restricciones que impiden el overlay
1. El usuario intenta cargar un overlay sobre una página con políticas de seguridad muy estrictas que impiden la inyección de elementos visuales.
2. La extensión muestra un mensaje en el popup: "No es posible mostrar overlays en esta página debido a restricciones de seguridad."

### Escenario 6: Snapshot de página con contenido protegido
1. El usuario intenta tomar un snapshot de una página con contenido protegido (por ejemplo, video DRM o iframes cross-origin).
2. La extensión captura solo lo que puede; las áreas no capturables se muestran como zonas neutras (color sólido) con una nota explicativa.

### Escenario 7: Cancelación de carga de imagen
1. El usuario inicia la carga de una imagen pero cancela el diálogo de selección de archivo.
2. La extensión no muestra ningún error; simplemente no se carga overlay y el usuario puede volver a intentarlo cuando guste.

## Reglas de negocio

1. La imagen cargada como overlay nunca se sube a un servidor remoto; permanece en la sesión local del usuario.
2. El overlay se maneja como una capa visual sobre la página; no modifica el DOM persistente ni el código fuente de la página.
3. Al recargar la página, el overlay se limpia automáticamente.
4. La opacidad del overlay debe poder ajustarse en un rango continuo de 0% a 100%.
5. Los formatos de imagen aceptados son al menos PNG, JPG, WEBP y SVG. Cualquier otro formato debe rechazarse con un mensaje claro al usuario.
6. Existe un tamaño máximo de imagen aceptado (por ejemplo, 20 MB). Si la imagen excede este tamaño, se rechaza con un mensaje informativo.
7. El overlay puede arrastrarse libremente por la página; su posición debe poder restablecerse al origen (0,0) o al centro del viewport mediante un botón rápido.
8. La extensión ofrece al menos los modos: opacidad simple, "difference" y/o inversión de colores, para facilitar la comparación visual.
9. Solo puede haber un overlay activo a la vez en esta versión; si el usuario carga una nueva imagen, la anterior se reemplaza.
10. El snapshot de la página implementada se genera localmente; no se envía a ningún servidor.
11. Las preferencias del overlay (último modo de mezcla usado, último valor de opacidad) pueden persistir entre sesiones del navegador, pero la imagen cargada no se persiste automáticamente.
12. El usuario puede ocultar el overlay temporalmente con un atajo sin perder la imagen cargada ni su posición.

## Cómo debe probarse (Etapa 2)

### Pruebas unitarias

- Validación de archivos de imagen cargados como overlay (extensión, tamaño máximo, tipo MIME).
- Lógica de cálculo de posición y escala del overlay al arrastrarlo o ajustarlo.
- Lógica de aplicación de modos de mezcla (qué modo está activo, transición entre modos).
- Lógica de generación del snapshot local de la página.

### Pruebas de funcionalidad (feature tests)

- Cargar una imagen de overlay y ajustar la opacidad debe reflejarse en tiempo real sobre la página.
- Arrastrar el overlay debe mover la imagen sin afectar el contenido de la página.
- Aplicar y quitar un modo de mezcla debe alternar correctamente la presentación visual.
- Recargar la página debe limpiar el overlay automáticamente.
- Tomar un snapshot y mostrar la vista lado a lado debe producir las dos imágenes correctamente.
- Rechazar archivos no válidos (formato o tamaño) debe disparar el mensaje correcto al usuario.
- Activar y desactivar el overlay con atajo de teclado debe conservar la posición y opacidad previas.
- Cambiar de pestaña y regresar debe conservar el estado del overlay en la pestaña original.

### Pruebas manuales

- Verificar la calidad visual del overlay de imagen al ajustar opacidad: que no se produzcan artefactos o desalineaciones.
- Validar que los modos de mezcla resaltan diferencias de manera útil y comprensible para el revisor.
- Probar la carga de imágenes con dimensiones muy distintas al viewport (más pequeñas, más grandes, distinta proporción) y verificar que la experiencia de alineación es razonable.
- Probar la extensión en páginas con scroll vertical largo y verificar el comportamiento del overlay (¿hace scroll junto al contenido? ¿permanece fijo?).
- Validar la usabilidad del control deslizante de opacidad y la fluidez al arrastrar el overlay.
- Verificar que las opciones de comparación (lado a lado, superpuesto, diferencias) son intuitivas y útiles para el flujo real de QA visual.
- Comprobar que no se filtran imágenes cargadas hacia ningún servicio remoto (verificación de privacidad).
- Probar el comportamiento del overlay en pantallas de alta densidad (Retina, 4K) y validar la nitidez de la imagen.

---

## Fuera de alcance (aplica a todo el producto)

- Edición persistente del código fuente o de los estilos de la página inspeccionada.
- Sincronización en la nube de las configuraciones del usuario o de los overlays cargados.
- Integración directa con la API de Figma (la extensión no se conecta a Figma; el usuario debe exportar manualmente las imágenes que desee superponer).
- Generación automática de reportes de discrepancias entre diseño e implementación.
- Soporte para inspección de elementos dentro de iframes de origen distinto (cross-origin).
- Funcionalidades de testing automatizado de regresión visual (la extensión asiste en revisiones manuales, no reemplaza herramientas de visual regression testing).
- Capacidades colaborativas en tiempo real entre varios usuarios.
- Soporte para navegadores distintos de Chrome en esta primera versión.
- Anotaciones persistentes que sobrevivan a la recarga de página (comentarios, marcadores, etc.).
- Comparación automática que detecte diferencias entre dos imágenes (pixel diff algorítmico) en esta primera versión; la comparación se hace visualmente mediante el overlay con opacidad y los modos de mezcla.
- Soporte para múltiples overlays simultáneos en la Etapa 2; solo se admite uno por sesión.

## Preguntas abiertas

### Sobre la Etapa 1

1. ¿Cuál es el conjunto exacto de atajos de teclado por defecto que se quiere ofrecer? ¿Hay preferencias internas del equipo basadas en herramientas similares?
2. ¿Se desea exportar/importar la paleta de colores y las preferencias del usuario para compartirlas entre miembros del equipo?
3. ¿La extensión debe ofrecer modo oscuro / claro automático según el tema del navegador o se mantiene un solo tema visual?
4. ¿Se contempla un onboarding interactivo (tour guiado) la primera vez que se instala la extensión?
5. ¿La paleta de colores debe incluir alguna paleta predeterminada basada en design tokens o sistemas de diseño comunes (Material, Tailwind, etc.)?
6. ¿La medición de distancia entre elementos debe contemplar también elementos no visibles en el viewport actual (requiriendo scroll automático)?
7. ¿Cuál es el comportamiento esperado al inspeccionar páginas con `position: fixed` o `sticky` que se mueven con el scroll? ¿Las mediciones se actualizan al scrollear?
8. ¿Debería existir un historial de inspecciones recientes para volver fácilmente a elementos previamente revisados durante la sesión?
9. ¿Qué grosor y estilo de outline se usará por defecto para los resaltados? ¿Es configurable por el usuario?

### Sobre la Etapa 2

10. ¿La extensión debe ofrecer alguna integración liviana con Figma (por ejemplo, pegar un enlace público de un frame y que la extensión obtenga la imagen automáticamente), o se mantiene completamente desconectada en esta versión?
11. ¿El overlay debe poder fijarse al viewport (sticky) o moverse con el scroll de la página? ¿O debe ser configurable por el usuario?
12. ¿Se necesita poder redimensionar la imagen del overlay (escalar) además de moverla, o se asume que la imagen exportada de Figma ya tiene el tamaño correcto?
13. ¿Es necesario soportar la persistencia del overlay (imagen + posición + opacidad) entre recargas, o el comportamiento actual de limpiarlo es el correcto?
14. ¿Qué modos de mezcla son prioritarios para el flujo del equipo? ¿"difference" es suficiente o se requieren también "multiply", "overlay", etc.?
