# Pixly

Extensión de Chrome (Manifest V3) para inspección visual de layouts y comparación con diseños de Figma. Construida con Vite, TypeScript, `@crxjs/vite-plugin` y Shadow DOM para aislar todo el UI inyectado en la página.

## Funcionalidades

### Etapa 1 — Inspección y medición

- Inspector de elementos con dimensiones y distancias hacia el padre.
- Pintar fondos con `Shift+Click` y outlines con `Ctrl+Shift+B` usando el color seleccionado de la paleta.
- Inspector tipográfico (font-family, size, line-height, letter-spacing, weight, color) con valores copiables.
- Inspector de colores de fondo en formatos hex y rgb.
- Captura de especificaciones CSS completas de cualquier elemento en un panel flotante con "Copiar todo".
- Outlines globales para visualizar todos los bloques.
- Inspeccionar espaciado (padding en verde, margin en naranja).
- Grid overlay configurable (columnas, gutter, ancho máx., color, opacidad).
- Reglas y guías arrastrables.
- Medición de distancia entre dos elementos (horizontal, vertical, diagonal).
- Lupa flotante con zoom ajustable.
- Paleta de colores personalizable (hasta 20 colores).
- Atajos de teclado configurables con detección de conflictos.
- Limpieza automática al recargar la página.

### Etapa 2 — Comparación con Figma

- Carga de imagen de overlay (PNG, JPG, WEBP, SVG; máx. 20 MB).
- Opacidad ajustable (0–100%).
- Drag para alinear con la implementación.
- Modos de mezcla (normal, multiply, screen, overlay, difference, exclusion).
- Snapshot de la página con `chrome.tabs.captureVisibleTab` y vista lado a lado con scroll sincronizado.
- Persistencia temporal: al cambiar de pestaña y volver, el estado del overlay se conserva.

## Requisitos

- Node.js 20+
- npm 10+

## Instalación de dependencias

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Vite mantiene una build incremental en `dist/`. Carga la extensión desempaquetada en Chrome (ver siguiente sección).

## Build de producción

```bash
npm run build
```

Genera la extensión empaquetada en `dist/`.

## Cargar la extensión en Chrome (sin firmar)

1. Ejecuta `npm run build`.
2. Abre `chrome://extensions/`.
3. Activa el "Modo de desarrollador" (esquina superior derecha).
4. Haz clic en "Cargar extensión sin empaquetar".
5. Selecciona la carpeta `dist/` generada por el build.

El icono Pixly aparecerá en la barra de herramientas. Haz clic para abrir el popup.

## Atajos por defecto

- `Alt+I` — Inspector de elementos
- `Alt+T` — Inspector tipográfico
- `Alt+G` — Grid overlay
- `Alt+O` — Mostrar/ocultar overlay de imagen
- `Esc` — Salir de cualquier modo activo
- `Shift+Click` — Pintar fondo del elemento
- `Ctrl+Shift+B` — Aplicar outline al elemento

Puedes personalizarlos desde la pestaña "Configuración" del popup.

## Pruebas

```bash
npm test
```

Cubre la lógica pura (parsing de colores, distancias, validaciones, especificaciones CSS, detección de conflictos de atajos, validación de imágenes).

## Verificación de tipos

```bash
npm run typecheck
```

## Estructura

```
src/
├── background/           # Service worker (Manifest V3)
├── content/              # Content script y herramientas inyectadas
│   ├── overlay/          # Overlay de imagen y snapshot (Etapa 2)
│   ├── tools/            # Herramientas individuales (Etapa 1)
│   └── styles/           # CSS aislado dentro del Shadow DOM
├── popup/                # UI del popup
├── shared/               # Constantes, tipos y utilidades compartidas
└── manifest.config.ts    # Manifest generado por @crxjs/vite-plugin
```

## Privacidad

- Ninguna imagen cargada como overlay se sube a un servidor: todo permanece en la sesión local del navegador (`chrome.storage.local` y memoria del content script).
- Los snapshots se generan localmente con `chrome.tabs.captureVisibleTab` y se muestran solo en la pestaña activa.
