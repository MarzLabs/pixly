# Pixly v2 — Mejoras de ergonomía, precisión y estética

## Descripción general

Esta especificación describe la **segunda iteración** de Pixly, una extensión de Chrome ya existente para inspección visual y comparación de layouts contra diseños de Figma. La iteración 1 cubrió un set completo de herramientas (inspector con hover, color de fondo/outline, distancias hacia elementos adyacentes, inspector tipográfico, inspector de colores, reglas/guías arrastrables, medición entre dos elementos, grid overlay, outlines globales, inspect spacing, captura de specs CSS, lupa, paleta configurable, atajos de teclado, persistencia, y la superposición de imagen de Figma con opacidad, drag, blend modes y vista lado a lado).

La iteración 2 toma como referencia el comportamiento y la estética de herramientas modernas como [MeasureMate](https://measuremate.xyz/), Linear, Figma y Vercel, y busca tres objetivos: (1) **mejorar la ergonomía** de las mediciones eliminando pasos innecesarios, (2) **aumentar la precisión** mediante snapping y nudge con teclado, y (3) **modernizar la estética** del UI para que se sienta como una herramienta de diseño y no como una herramienta de desarrollo.

Las mejoras son **modificaciones y adiciones** sobre la versión existente. Las funcionalidades ya construidas se mantienen disponibles, aunque algunas cambian de comportamiento (la más relevante: la medición entre dos elementos pasa de un flujo de dos clicks a un flujo de pin + hover). Toda la configuración persistida en la iteración 1 (paleta de colores, atajos, preferencias) debe sobrevivir a la actualización sin requerir intervención del usuario.

El alcance de esta spec es exclusivamente las mejoras listadas a continuación; el resto del producto se mantiene tal como está descrito en `specs/finished/chrome_extension_layout_inspector.md`.

## User stories

- Como **desarrollador frontend**, quiero fijar un elemento de referencia y luego pasar el cursor sobre otros elementos para ver sus distancias en vivo, para evitar el costo cognitivo de recordar cuál fue mi primer click.
- Como **diseñador**, quiero que cuando seleccione un elemento aparezcan guías automáticas alineadas a sus bordes, para detectar de un vistazo qué otros elementos comparten alineación.
- Como **revisor de QA visual**, quiero un panel lateral persistente que me muestre toda la información del elemento inspeccionado sin tener que perseguir tooltips flotantes, para revisar especificaciones con más calma.
- Como **diseñador**, quiero que mis guías manuales se adhieran automáticamente a bordes, centros y baselines de elementos cercanos, para que las alineaciones sean exactas sin tener que hacer zoom manual.
- Como **desarrollador frontend**, quiero poder seleccionar una guía y moverla con las flechas del teclado, para corregir su posición con precisión de un pixel.
- Como **revisor de QA visual**, quiero seleccionar varios elementos a la vez con Shift+click y ver todas las distancias entre ellos, para validar alineaciones grupales.
- Como **diseñador**, quiero crear guías horizontales y verticales en cualquier punto del viewport, arrastrándolas desde una regla superior o lateral, para tener control absoluto sobre mis referencias visuales.
- Como **usuario en general**, quiero que Pixly se vea moderna y profesional, con tipografía limpia, paleta sobria y microinteracciones suaves, para que la herramienta sea agradable de usar durante sesiones largas de revisión.

## Criterios de aceptación

1. La medición entre dos elementos opera bajo el modelo de pin + hover: un solo click fija un elemento de referencia y los movimientos del cursor sobre otros elementos muestran las distancias en vivo.
2. Al fijar (pinear) un elemento, aparecen automáticamente cuatro guías (top, bottom, left, right) extendidas a todo el viewport, visualmente distinguibles de las guías manuales del usuario.
3. La extensión cuenta con un panel lateral persistente que muestra información completa del elemento hovered o pinned, incluyendo box model visual, estilos agrupados por categoría, atributos relevantes y un navegador del árbol DOM.
4. Las reglas y guías manuales se adhieren automáticamente a bordes, centros y baselines de elementos cercanos cuando se arrastran, con indicación visual del punto de snap y posibilidad de desactivar el snap manteniendo `Alt`.
5. Una guía o regla puede seleccionarse haciendo click y, una vez seleccionada, moverse con las flechas del teclado (1px por defecto, 10px con Shift) o eliminarse con `Delete`/`Backspace`.
6. El usuario puede mantener `Shift` presionado al hacer click para seleccionar múltiples elementos simultáneamente, viendo cada uno resaltado, las distancias entre ellos y un bounding box colectivo en el panel inspector.
7. Existe un modo libre de guías que permite arrastrar guías horizontales y verticales desde una regla superior y otra lateral, posicionándolas en cualquier punto del viewport y con cálculo automático de distancias entre guías paralelas.
8. El UI completo de Pixly (popup, panel inspector, controles flotantes, tooltips) se actualiza con una estética design-first inspirada en interfaces como Linear, Figma y Vercel.
9. Todas las configuraciones del usuario persistidas en la iteración 1 (paleta personalizada, atajos personalizados, preferencias) se mantienen intactas después de la actualización.
10. Las funcionalidades existentes que no se mencionan explícitamente en esta spec siguen funcionando como en la iteración 1 sin regresiones.

## Happy paths

### Escenario 1: Medir distancias con pin + hover

1. El usuario activa la herramienta de medición entre elementos desde el popup o con su atajo.
2. El usuario hace click sobre un elemento (por ejemplo, un botón en el header). El elemento queda **fijado** y muestra un indicador visual claro de su estado pinned (por ejemplo, un outline persistente con un estilo distintivo y un pequeño marcador de "pin").
3. El usuario mueve el cursor sobre otro elemento de la página (por ejemplo, una tarjeta más abajo). Inmediatamente aparecen líneas y valores que muestran la distancia horizontal, vertical y diagonal entre el elemento pinned y el elemento hovered.
4. El usuario continúa moviendo el cursor sobre distintos elementos; las distancias se actualizan en vivo respecto al elemento pinned.
5. Para terminar la medición, el usuario hace click nuevamente sobre el elemento pinned, presiona `Escape`, o cambia a otra herramienta. El elemento queda des-fijado y las líneas de distancia desaparecen.

### Escenario 2: Guías automáticas al pinear un elemento

1. El usuario activa la medición con pin + hover y hace click sobre un elemento.
2. Inmediatamente aparecen cuatro guías extendidas a todo el viewport: una alineada con el borde superior del elemento, otra con el inferior, otra con el izquierdo y otra con el derecho.
3. Las guías automáticas tienen un estilo visual distinto a las guías manuales del usuario (por ejemplo, un color o tipo de línea diferente, y posiblemente más sutil) para que sean fácilmente diferenciables.
4. Mientras el usuario hace hover sobre otros elementos, puede verificar visualmente si comparten alineación con el elemento pinned simplemente observando si sus bordes coinciden con las guías.
5. Al des-pinear el elemento, las cuatro guías automáticas desaparecen.

### Escenario 3: Uso del panel inspector como sidebar persistente

1. El usuario activa la opción "Mostrar panel inspector" desde el popup o con su atajo.
2. El panel aparece pegado al lado derecho del viewport (o al izquierdo, según la preferencia del usuario en configuración).
3. Mientras el usuario hace hover sobre cualquier elemento, el panel se actualiza con la información del elemento debajo del cursor.
4. El panel muestra al menos las siguientes secciones, todas colapsables:
   - **Box model visual**: representación gráfica del modelo de caja del elemento con valores numéricos de margin, border, padding y content.
   - **Tipografía**: font-family, font-size, line-height, letter-spacing, font-weight, color del texto.
   - **Colores**: background-color, color, en formatos hex y rgb.
   - **Espaciado**: margin y padding agrupados.
   - **Layout**: display, position, top/right/bottom/left, z-index.
   - **Bordes**: border, border-radius, box-shadow.
   - **Atributos**: id, class, role, aria-* relevantes.
   - **Árbol DOM**: indicador del elemento padre directo, lista de hijos directos.
5. El usuario hace click sobre cualquier valor mostrado (por ejemplo, "16px" para font-size, o "#FF5733" para un color). El valor se copia al portapapeles y aparece una confirmación breve.
6. El usuario hace click en el indicador del elemento padre dentro de la sección Árbol DOM. El elemento inspeccionado cambia al padre, el panel se actualiza, y el resaltado en la página se mueve al nuevo elemento.
7. El usuario hace click en un hijo del elemento actual desde la sección Árbol DOM. El elemento inspeccionado cambia al hijo seleccionado.
8. El usuario fija (pinea) el elemento actual desde el panel para que la información se quede estable mientras inspecciona otros elementos. El panel sigue mostrando el elemento pinned en lugar de actualizarse con el hover.
9. El usuario oculta el panel con su toggle; el panel se cierra y el viewport recupera el espacio.

### Escenario 4: Snap automático al arrastrar una guía

1. El usuario tiene activa la herramienta de reglas y guías.
2. El usuario arrastra una guía vertical existente hacia el borde izquierdo de un elemento cercano.
3. Cuando la guía llega a menos del umbral de snap (5px por defecto, configurable) de un borde de elemento, salta automáticamente para alinearse con él.
4. Mientras la guía está en estado de snap, aparece una indicación visual sutil (por ejemplo, un pequeño marcador o un cambio de color) que indica a qué punto se está adhiriendo (borde, centro o baseline).
5. El usuario sigue arrastrando; la guía puede saltar al centro de otro elemento cercano, o a la baseline de un texto, según el punto más cercano dentro del umbral.
6. El usuario mantiene presionada la tecla `Alt` mientras arrastra. El snap se desactiva temporalmente y la guía se mueve libremente al pixel.
7. El usuario suelta la guía. Si soltó con snap activo, la guía queda exactamente alineada con el punto de snap. Si soltó con `Alt`, queda en la posición libre.

### Escenario 5: Nudge con teclado sobre una guía seleccionada

1. El usuario tiene varias guías creadas en la página.
2. El usuario hace click sobre una de las guías. La guía queda **seleccionada** y muestra una indicación visual de selección (por ejemplo, un cambio de color o grosor sutil).
3. El usuario presiona la flecha derecha. La guía se mueve 1px hacia la derecha.
4. El usuario presiona `Shift` + flecha derecha. La guía se mueve 10px hacia la derecha.
5. El usuario presiona `Delete` (o `Backspace`). La guía se elimina.
6. El usuario crea otra guía, la selecciona, y presiona `Escape`. La guía queda des-seleccionada (pero no se elimina).

### Escenario 6: Multiselección de elementos con Shift+click

1. El usuario activa el inspector y hace click sobre un primer elemento. El elemento queda seleccionado.
2. El usuario mantiene `Shift` y hace click sobre un segundo elemento. Ambos elementos quedan seleccionados y se resaltan simultáneamente.
3. La extensión muestra automáticamente las distancias entre los elementos seleccionados (al menos entre cada par consecutivo en el orden de selección, idealmente entre todos los pares).
4. El panel inspector muestra:
   - El bounding box colectivo que contiene a todos los elementos seleccionados, con sus dimensiones globales.
   - Las distancias entre los elementos en formato de tabla o listado.
5. El usuario continúa agregando elementos con `Shift` + click; cada nuevo elemento se suma a la selección.
6. El usuario mantiene `Ctrl` (Windows/Linux) o `Cmd` (macOS) y hace click sobre un elemento ya seleccionado. Ese elemento queda des-seleccionado y desaparece de la lista, pero los demás permanecen.
7. El usuario presiona `Escape`. Toda la selección se limpia.

### Escenario 7: Crear guías libres desde reglas superior e izquierda

1. El usuario activa el modo libre de guías desde el popup o con su atajo.
2. Aparecen dos reglas: una en el borde superior del viewport y otra en el borde izquierdo, con marcas numéricas en pixels.
3. El usuario hace click sobre la regla superior y arrastra hacia abajo. Una guía horizontal sigue al cursor.
4. Mientras se arrastra, un tooltip junto al cursor muestra la posición exacta de la guía en pixels (por ejemplo, "Y: 248px").
5. El usuario suelta la guía. Queda fija en esa posición Y del viewport.
6. El usuario repite el proceso desde la regla izquierda para crear una guía vertical.
7. Cuando hay dos guías paralelas (por ejemplo, dos horizontales), aparece automáticamente entre ellas un indicador con la distancia exacta en pixels.
8. El usuario hace click sobre una guía libre para seleccionarla y aplicar los nudges con teclado descritos en el escenario 5.

### Escenario 8: Estética design-first

1. El usuario abre el popup de Pixly después de la actualización.
2. Observa una interfaz con:
   - Paleta de colores sobria (grises neutros con un único color de acento, por ejemplo).
   - Tipografía sans-serif moderna y limpia (Inter, Geist, o la fuente del sistema), con jerarquía clara entre títulos y cuerpos.
   - Iconos minimalistas tipo "line icons" con peso consistente.
   - Bordes redondeados consistentes en botones, paneles y tooltips.
   - Sombras sutiles que dan sensación de capas sin saturar visualmente.
   - Espaciado generoso entre controles.
3. Al hacer hover sobre un botón o un control, una microinteracción suave (por ejemplo, un cambio leve de fondo o de opacidad con transición corta) confirma la interacción sin ser agresiva.
4. Al abrir el panel inspector, este se desliza desde el borde con una transición suave.
5. El usuario percibe consistencia entre el popup, el panel inspector, los tooltips y cualquier control flotante: todos comparten la misma identidad visual.

## Sad paths

### Escenario 1: Pin sobre un elemento que desaparece del DOM

1. El usuario pinea un elemento. La extensión muestra las distancias en vivo conforme el cursor se mueve.
2. La página actualiza su DOM y el elemento pinned desaparece (por ejemplo, un toast que se cierra automáticamente).
3. La extensión detecta que el elemento pinned ya no existe, limpia automáticamente el estado de pin, oculta las cuatro guías automáticas y muestra una notificación breve: "El elemento fijado ya no existe en la página."
4. El usuario puede pinear otro elemento para continuar.

### Escenario 2: Click sobre un elemento que es padre o hijo de uno ya seleccionado

1. El usuario hace click sobre un elemento que contiene visualmente a otro elemento (por ejemplo, un contenedor y una tarjeta dentro).
2. El usuario mantiene `Shift` y hace click sobre el elemento hijo. La extensión muestra ambos como seleccionados, pero advierte de forma sutil que existe relación de contención entre ellos (por ejemplo, un tooltip informativo: "Estos elementos tienen relación padre-hijo; las distancias pueden no ser representativas.").
3. Las mediciones se calculan normalmente; la advertencia es solo informativa, no bloquea la acción.

### Escenario 3: Pin sin haber activado la herramienta de medición

1. El usuario hace click sobre un elemento sin haber activado la herramienta de medición.
2. La extensión no fija el elemento; se mantiene el comportamiento estándar de la página.
3. Si el usuario tenía el inspector activo (modo hover), simplemente continúa el inspector como antes.

### Escenario 4: Panel inspector con elemento muy profundo en el árbol DOM

1. El usuario hace hover sobre un elemento que tiene cientos de atributos o una jerarquía DOM muy profunda.
2. El panel inspector limita la cantidad de hijos directos mostrados a un número razonable (por ejemplo, 20) y agrega un control para "ver más".
3. La sección de atributos se renderiza con scroll interno si la lista es larga, sin que el panel ocupe más espacio del que tiene asignado.

### Escenario 5: Snap activo en una página con cientos de elementos cercanos

1. El usuario arrastra una guía en una página densa (un dashboard con muchos componentes pequeños).
2. La extensión limita los candidatos de snap a los elementos visibles en el viewport y prioriza los más cercanos al cursor.
3. Si por desempeño la búsqueda de snap se vuelve lenta, la extensión degrada graciosamente reduciendo la cantidad de candidatos evaluados y nunca bloquea el arrastre.
4. El usuario siempre puede mantener `Alt` para desactivar el snap si encuentra el comportamiento poco predecible.

### Escenario 6: Tecla de nudge sin guía seleccionada

1. El usuario presiona una flecha del teclado pero no tiene ninguna guía seleccionada.
2. La extensión no realiza ninguna acción y deja que el comportamiento por defecto del navegador o de la página tome control (por ejemplo, hacer scroll de la página).
3. No se muestra ningún mensaje de error.

### Escenario 7: Conflicto entre nudge de guía y atajos de la página

1. El usuario tiene una guía seleccionada y presiona una flecha del teclado.
2. La página inspeccionada también tiene un listener de teclado que reacciona a las flechas (por ejemplo, un carrusel).
3. La extensión consume el evento de teclado mientras la guía esté seleccionada para evitar el conflicto.
4. Al des-seleccionar la guía (Escape, click fuera o cambio de herramienta), los atajos de la página vuelven a funcionar normalmente.

### Escenario 8: Multiselección con un solo elemento seleccionado

1. El usuario hace click sobre un elemento y luego mantiene `Shift` y vuelve a clickear sobre el mismo elemento.
2. La extensión interpreta esto como des-seleccionar el elemento; el estado vuelve a "ningún elemento seleccionado".
3. No se muestra error.

### Escenario 9: Crear una guía libre fuera del viewport

1. El usuario arrastra una guía desde la regla superior y suelta el cursor fuera del viewport visible (por ejemplo, arrastrando hacia arriba más allá del borde).
2. La extensión clampa la posición de la guía al rango visible o muestra un breve indicador de que la guía no se creó.
3. Si la guía sí se creó pero en una zona no visible por scroll, debe ser igualmente accesible cuando el usuario haga scroll a esa zona.

### Escenario 10: Migración con preferencias en formato antiguo

1. El usuario actualiza a la iteración 2 desde la iteración 1.
2. La extensión detecta el formato de configuraciones almacenadas previamente y lo migra al formato actual sin perder datos: la paleta personalizada, los atajos personalizados y las preferencias siguen disponibles.
3. Si por alguna razón una preferencia antigua no puede migrarse, la extensión usa el valor por defecto y registra el cambio en un log accesible desde el popup, pero **nunca** resetea silenciosamente todas las configuraciones.

### Escenario 11: Pin + hover sobre el mismo elemento ya pinned

1. El usuario tiene un elemento A pinned y mueve el cursor sobre el mismo elemento A.
2. La extensión no muestra distancias (la distancia de un elemento a sí mismo es cero y no aporta valor).
3. Las cuatro guías automáticas siguen visibles. El cursor mantiene el comportamiento de hover normal del inspector, pero las líneas de distancia se ocultan hasta que el cursor se mueva a otro elemento.

## Reglas de negocio

1. **La medición entre dos elementos ya no funciona con dos clicks**: la iteración 1 tenía un flujo de click A → click B → mostrar distancia. La iteración 2 reemplaza ese comportamiento por pin + hover. No coexisten ambos modos.
2. El elemento pinned se conserva mientras la herramienta de medición esté activa, sobreviviendo a cambios de cursor pero **no** a cambios de herramienta ni a recarga de página.
3. Las guías automáticas (las que aparecen al pinear) son una capa visual generada por la extensión y nunca pueden ser arrastradas, seleccionadas ni eliminadas como las guías manuales. Su único disparador es el estado pinned.
4. El panel inspector como sidebar es **complementario** al tooltip flotante del hover: el usuario puede usar uno, el otro, o ambos. La configuración debe ofrecer la opción de desactivar el tooltip flotante cuando el panel está activo para evitar saturación.
5. El panel inspector se posiciona en el borde derecho por defecto. El usuario puede cambiar a "izquierdo" desde la configuración. No se permite posicionarlo en top o bottom en esta iteración.
6. El panel inspector cuando está abierto **no debe alterar el layout de la página inspeccionada**: se renderiza como una capa flotante por encima del contenido. La página sigue ocupando todo el viewport detrás del panel.
7. El navegador del árbol DOM dentro del panel inspector muestra **solo elementos visibles** (ignorando los que tienen `display: none` o `visibility: hidden`), consistente con la regla existente de la iteración 1.
8. El snap inteligente se aplica únicamente al arrastrar guías y reglas manuales. **No** se aplica al arrastrar el overlay de imagen de Figma (que ya tiene su propio sistema de drag), ni a otros controles flotantes.
9. El umbral de snap por defecto es 5px y debe ser configurable desde el popup en un rango razonable (por ejemplo, de 1px a 20px).
10. Los tipos de puntos a los que se adhiere el snap son, en orden de prioridad: bordes de elementos > centros (horizontal y vertical) > baselines de texto. Si dos candidatos están a la misma distancia, gana el más cercano al cursor.
11. La tecla `Alt` desactiva temporalmente el snap solo mientras se mantiene presionada; al soltarla, el snap vuelve a operar normalmente. Esto es consistente con el comportamiento de Figma.
12. Una guía solo puede estar en uno de tres estados: no seleccionada, hover (cuando el cursor está sobre ella), o seleccionada (después de un click). Solo una guía puede estar seleccionada a la vez.
13. El nudge con teclado (flechas) opera únicamente sobre la guía actualmente seleccionada. Si no hay guía seleccionada, las teclas de flecha no son consumidas por la extensión.
14. La multiselección de elementos preserva el orden de selección. Las distancias entre pares consecutivos se calculan en ese orden. Esta información debe mostrarse de forma clara en el panel inspector.
15. El número máximo de elementos en multiselección es razonable (por ejemplo, 10). Si el usuario intenta agregar más, la extensión muestra una notificación informativa.
16. Las reglas superior e izquierda del modo libre de guías son visibles únicamente cuando ese modo está activo; no son permanentes. Al desactivarlo, las reglas desaparecen pero las guías creadas permanecen hasta que el usuario las elimine o recargue la página.
17. Las guías libres y las guías creadas en el modo tradicional de la iteración 1 son del mismo tipo y comparten comportamiento (selección, nudge, eliminación). La diferencia es solo el mecanismo de creación.
18. La distancia entre dos guías paralelas se muestra automáticamente cuando ambas existen y son del mismo tipo (ambas horizontales o ambas verticales). Si hay más de dos guías paralelas, se muestran las distancias consecutivas, no todas las combinaciones.
19. La estética design-first **debe aplicar de forma consistente** a todos los puntos de contacto del UI de Pixly: popup, panel inspector, tooltips flotantes, controles flotantes, mensajes de notificación, indicadores de snap, marcadores de pin. No se permite que algunas zonas conserven el aspecto de la iteración 1 y otras adopten el nuevo.
20. La paleta de colores del UI de Pixly se compone de grises neutros como base y un único color de acento usado para indicar acciones primarias, elementos activos y selecciones. La paleta concreta es decisión de diseño, pero debe documentarse internamente para mantener consistencia.
21. La tipografía del UI debe ser sans-serif moderna (Inter, Geist o la stack tipográfica del sistema operativo como fallback). El tamaño base, jerarquía y line-height deben favorecer la legibilidad en sesiones largas.
22. Las microinteracciones (hover, click, apertura/cierre de panel, aparición de tooltips) usan transiciones cortas (en el rango de 100ms a 200ms) con curvas de easing suaves, nunca animaciones que llamen la atención por sí mismas.
23. **Compatibilidad con la iteración 1**: todas las funcionalidades existentes que no se mencionan en esta spec siguen funcionando exactamente como antes. Incluye, entre otras: hover con resaltado y medidas a elementos adyacentes, colores de fondo y outline aplicables a elementos, inspector tipográfico, inspector de colores, reglas y guías tradicionales, grid overlay, outlines globales, inspect spacing, captura de specs CSS, lupa, paleta configurable, atajos de teclado, persistencia, overlay de imagen de Figma con drag/opacidad/blend modes, snapshot, vista lado a lado.
24. **Persistencia de configuraciones**: la actualización de v1 a v2 **no debe resetear** ninguna configuración persistida. La paleta personalizada, los atajos personalizados y las preferencias del usuario deben sobrevivir intactos a la actualización.
25. La extensión sigue limpiando todo estado visual al recargar la página: elementos pinned, guías automáticas, guías libres, multiselección, snap, selección de guías, y todo lo demás se resetea al recargar, consistente con la iteración 1.
26. El panel inspector, al estar abierto, debe ser cerrable desde un control visible en el propio panel y desde el popup. No es necesario que tenga su propio atajo de teclado, aunque es deseable.
27. Las acciones del usuario sobre el panel inspector (colapsar secciones, copiar valores, navegar el árbol DOM) **no** afectan al estado de la página inspeccionada; son acciones puramente visuales de la extensión.

## Cómo debe probarse

### Pruebas unitarias

- Lógica de cálculo de distancias horizontal, vertical y diagonal entre el elemento pinned y un elemento hovered, considerando bordes y centros.
- Lógica de detección de candidatos de snap: dado el cursor y una lista de elementos visibles, identificar el punto de snap más cercano dentro del umbral (bordes > centros > baselines).
- Lógica de migración de configuraciones de v1 a v2: dado un blob de preferencias antiguas, producir el blob v2 sin perder datos.
- Lógica de gestión del estado de multiselección: agregar, des-seleccionar, limpiar, calcular bounding box colectivo, calcular distancias entre pares consecutivos.
- Lógica de cálculo de la distancia automática entre dos guías paralelas (horizontales o verticales).
- Lógica de selección de guías: transiciones entre los estados no seleccionada / hover / seleccionada.
- Lógica de nudge: flecha → mover 1px, Shift+flecha → mover 10px, Delete → eliminar, Escape → des-seleccionar.
- Lógica de las cuatro guías automáticas al pinear un elemento: dadas las coordenadas y dimensiones del elemento, producir las cuatro líneas extendidas.
- Lógica de detección de elemento pinned desaparecido del DOM y limpieza automática del estado.

### Pruebas de funcionalidad (feature tests)

- Activar la herramienta de medición y pinear un elemento debe mostrar el marcador visual de pin y disparar las cuatro guías automáticas.
- Mover el cursor sobre otro elemento mientras hay un elemento pinned debe mostrar las distancias en vivo.
- Hacer click en el elemento pinned, presionar Escape o cambiar de herramienta debe des-pinear el elemento y limpiar las guías automáticas.
- Abrir el panel inspector debe renderizar todas las secciones (box model, tipografía, colores, espaciado, layout, bordes, atributos, árbol DOM) con la información del elemento bajo el cursor.
- Hacer click sobre un valor en el panel inspector debe copiarlo al portapapeles y mostrar confirmación.
- Navegar al padre o a un hijo en el árbol DOM dentro del panel debe cambiar el elemento inspeccionado y actualizar todas las secciones.
- Arrastrar una guía manual cerca de un borde de elemento debe disparar el snap y mostrar la indicación visual de a qué se está adhiriendo.
- Mantener Alt mientras se arrastra debe desactivar el snap temporalmente y permitir movimiento libre al pixel.
- Hacer click sobre una guía debe seleccionarla; presionar flechas debe moverla (1px sin Shift, 10px con Shift); Delete debe eliminarla; Escape debe des-seleccionarla.
- Hacer Shift+click sobre múltiples elementos debe acumular selección y mostrar distancias entre ellos.
- Ctrl/Cmd+click sobre un elemento ya seleccionado debe des-seleccionarlo manteniendo el resto.
- Escape con multiselección activa debe limpiar toda la selección.
- Activar el modo libre de guías debe mostrar las dos reglas (superior e izquierda).
- Arrastrar desde la regla superior debe crear una guía horizontal; desde la regla izquierda, una vertical. Ambas deben mostrar la posición en pixels mientras se arrastran.
- Tener dos guías paralelas (mismo tipo) debe mostrar automáticamente la distancia entre ellas.
- La actualización de v1 a v2 con configuraciones previamente persistidas (paleta personalizada, atajos personalizados, preferencias) debe conservar todos los datos.
- Las funcionalidades de la iteración 1 que no cambian (inspector con hover, colores aplicables, inspector tipográfico, inspector de colores, grid overlay, outlines globales, inspect spacing, captura de specs CSS, lupa, overlay de imagen, snapshot, vista lado a lado) deben seguir operando como antes sin regresiones.
- Recargar la página debe limpiar el estado de pin, las guías automáticas, las guías libres, la multiselección y la selección de guías, junto con todo lo demás ya cubierto en v1.

### Pruebas manuales

- Validar visualmente que el indicador de pin sobre un elemento es claro y distinguible del hover normal.
- Validar que las cuatro guías automáticas son visualmente diferentes de las guías manuales (color, estilo, opacidad) y que no se confunden entre sí en una página densa.
- Probar el panel inspector en páginas con layouts complejos (e-commerce, dashboards, landing pages) y verificar que la información mostrada es comprensible y útil.
- Validar la navegación del árbol DOM dentro del panel: que los nombres de elementos sean legibles, que el padre y los hijos se identifiquen rápidamente, y que los clicks cambien correctamente el elemento inspeccionado.
- Probar el snap en páginas con cientos de elementos visibles y validar que la experiencia se mantiene fluida.
- Probar la multiselección con 2, 5 y el máximo permitido de elementos y validar que las distancias se muestran de forma comprensible.
- Validar que el modo libre de guías se siente intuitivo: arrastrar desde una regla debe ser obvio para alguien que ha usado Figma o Photoshop.
- Verificar visualmente la nueva estética: que la paleta sea sobria, que la tipografía se vea limpia, que las microinteracciones se sientan suaves y no molestas.
- Comparar lado a lado el UI de v1 y v2 para asegurar que el cambio estético es consistente en todos los puntos de contacto.
- Verificar que las microinteracciones (apertura/cierre de panel, indicadores de snap, marcadores de pin) no producen flickering ni lag perceptible.
- Validar accesibilidad del nuevo panel inspector: navegación con teclado, contraste de texto, foco visible.
- Probar la actualización desde una instalación real con configuraciones de v1 y validar que no se pierde paleta, atajos ni preferencias.
- Verificar que no hay conflictos visuales entre el panel inspector y el overlay de imagen de Figma (la imagen no debe quedar tapada por el panel, o debe quedar parcialmente y de forma esperable).
- Probar el comportamiento del panel inspector en pantallas pequeñas (laptops 13") y grandes (monitores 27"+) y validar que el ancho del panel es razonable en ambas.
- Verificar que las flechas del teclado consumidas para el nudge de una guía no rompen comportamientos esperados de la página (al des-seleccionar la guía, el teclado vuelve a la página).

## Migración desde la iteración 1

Esta iteración es una **actualización in-place** de la extensión existente. Los usuarios que ya tienen Pixly instalada recibirán la nueva versión automáticamente (según la política de actualización de Chrome) o manualmente.

Reglas de migración:

1. **Todas las configuraciones persistidas en v1 deben sobrevivir**: paleta personalizada, atajos personalizados, preferencias (modo claro/oscuro si existe, unidades, valores por defecto del grid, etc.).
2. **No se debe mostrar al usuario un mensaje de "configuración reseteada"**. Si por alguna razón una preferencia particular no puede migrarse (cambio de formato interno, valor inválido), debe usarse el valor por defecto sin notificación, registrándolo solo en un log accesible desde el popup para soporte.
3. **Los atajos de teclado existentes se conservan**. Si la iteración 2 introduce nuevos atajos por defecto (por ejemplo, para abrir el panel inspector o activar el modo libre de guías), se asignan a combinaciones que no entren en conflicto con los atajos existentes del usuario ni con atajos comunes del navegador.
4. **No hay datos efímeros que migrar**: los overlays, elementos pinned, selecciones y guías de la iteración 1 nunca persistieron entre recargas, así que no hay nada que preservar a ese nivel.
5. La primera vez que el usuario abra el popup después de la actualización, puede mostrarse un mensaje breve y descartable que comunique los cambios principales (por ejemplo, "Pixly se actualizó. La medición entre elementos ahora funciona con pin + hover. Toca aquí para ver el resumen de cambios."). Este mensaje **no es bloqueante**.

## Comportamientos existentes que cambian

La siguiente tabla resume los comportamientos de la iteración 1 que cambian con esta iteración:

| Comportamiento en v1 | Comportamiento en v2 |
| --- | --- |
| Medición entre dos elementos con dos clicks (click A → click B → mostrar distancia). | Reemplazado por pin + hover: un click fija un elemento y el hover sobre otros muestra distancias en vivo. |
| Las reglas y guías manuales se arrastran libremente al pixel. | Las reglas y guías manuales hacen snap a bordes, centros y baselines de elementos cercanos por defecto; `Alt` desactiva temporalmente. |
| Las guías solo se mueven arrastrándolas con el cursor. | Las guías pueden seleccionarse con click y moverse con flechas del teclado (1px / 10px con Shift) o eliminarse con Delete. |
| Solo se puede seleccionar un elemento a la vez para inspeccionar. | Se puede seleccionar múltiples elementos con Shift+click; muestran distancias entre ellos y un bounding box colectivo. |
| Las guías solo pueden crearse a partir de bordes de elementos (o variantes existentes). | Existe adicionalmente el modo libre: arrastrar desde reglas superior/izquierda crea guías en cualquier punto del viewport. |
| Información del elemento mostrada únicamente en tooltips flotantes. | Información disponible también en un panel lateral persistente con árbol DOM navegable. |
| Aspecto visual de developer tool. | Aspecto visual design-first, inspirado en Linear, Figma y Vercel. |

Todos los demás comportamientos de la iteración 1 se mantienen sin cambios.

## Fuera de alcance

- Cambios al overlay de imagen de Figma (etapa 2 de v1): la opacidad, drag, blend modes, snapshot y vista lado a lado siguen exactamente como en v1.
- Integración directa con Figma vía API.
- Persistencia de elementos pinned, multiselección o guías entre recargas de página.
- Multiselección con más elementos de los que la regla 15 establece como máximo razonable.
- Posicionamiento del panel inspector en el top o bottom del viewport.
- Snap aplicado a otros controles distintos a guías y reglas manuales (por ejemplo, no aplica al overlay de imagen).
- Sincronización en la nube de las configuraciones, guías o selecciones.
- Comparación automática pixel-by-pixel entre dos imágenes (sigue siendo manual con opacidad y blend modes).
- Soporte para inspección dentro de iframes cross-origin (continúa siendo limitación de v1).
- Anotaciones persistentes (comentarios, marcadores) entre recargas.

## Preguntas abiertas

1. ¿La nueva medición con pin + hover debe ser la única opción, o se debe ofrecer al usuario una preferencia en configuración para volver al comportamiento de dos clicks de v1 durante un período de transición?
2. Para la multiselección, ¿se prefiere mostrar las distancias entre todos los pares posibles (gráfico denso) o solo entre cada par consecutivo en el orden de selección (más limpio)? La spec asume "consecutivos" por defecto pero se puede revisar.
3. ¿Cuál debe ser el umbral de snap por defecto (5px sugerido) y los límites configurables (1px–20px sugerido)?
4. ¿El panel inspector debe tener su propio atajo de teclado por defecto, o solo es accesible desde el popup y desde su toggle? Si tiene atajo, ¿cuál sugiere el equipo?
5. ¿Cuál es el límite razonable de elementos en multiselección? La spec sugiere 10, pero podría ajustarse.
6. ¿La paleta de colores del nuevo aesthetic será definida desde un sistema de design tokens del equipo o se documenta solo dentro de Pixly?
7. ¿La fuente preferida es Inter, Geist o la stack del sistema operativo? La elección impacta la sensación final del UI.
8. ¿Se desea un onboarding interactivo que destaque las nuevas funcionalidades la primera vez que el usuario abre el popup después de la actualización?
9. ¿El árbol DOM dentro del panel inspector debe mostrar los hermanos (siblings) del elemento actual además del padre y los hijos? La spec asume "padre + hijos" por simplicidad.
10. ¿Cuál es el comportamiento esperado cuando el usuario hace Shift+click sobre un elemento dentro de un iframe externo (cross-origin)? La spec asume que se ignora silenciosamente, consistente con la limitación existente.
