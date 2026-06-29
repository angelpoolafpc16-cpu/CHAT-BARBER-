# Segundo cerebro — funciones pendientes (roadmap futuro)

Lista de lo que pedías en el JSON original que **no** se implementó todavía, porque es un proyecto grande por sí solo. Lo que sí quedó listo: notas con etiqueta manual/auto, vista de lista en tarjetas, una vista de grafo con física real (repulsión/atracción/colisiones/respiración), y la sección completa de notas tipo Obsidian (ver ✅ abajo).

Cuando quieras retomar algo de esto, dime cuál y lo planeamos como su propio proyecto.

## ✅ 1. Notas más completas (tipo Obsidian) — implementado
- ✅ Editor con Markdown (negritas, títulos, listas) con vista previa en vivo.
- ✅ Enlaces entre notas tipo `[[Nota]]` y "backlinks" (ver qué notas mencionan a otra).
- ✅ Etiquetas (#tags) por nota. (Alias soportados a nivel de datos para matching de wikilinks).
- ✅ Notas diarias automáticas (botón "📅 Hoy") y plantillas reutilizables (capa de datos lista, con gestor en la pestaña Notas).
- ✅ Historial de versiones de cada nota, con opción de restaurar.
- ✅ Pestañas y vista dividida (varias notas abiertas a la vez, lado a lado).

## 2. Importar archivos
- Arrastrar y soltar archivos o carpetas completas.
- Soporte para PDF, Word, Excel, PowerPoint, imágenes, audio, video, ZIP, etc.
- OCR (leer texto dentro de imágenes/PDFs escaneados).
- Extraer metadatos automáticamente y generar vista previa de cada archivo.
- Etiquetado y enlazado automático del contenido importado.

## 3. Grafo de conocimiento avanzado
- ✅ Físicas reales (nodos que se repelen/atraen, "respiran" solos, detectan colisiones) — implementado.
- Zoom/cámara suave, clusters automáticos que se agrupan o explotan al hacer zoom.
- Hover con brillo (glow) y resaltado de conexiones, atenuando el resto.
- Clic en un nodo: centra la cámara, hace zoom y difumina el fondo (como Obsidian).
- Búsqueda semántica dentro del grafo con resaltado de la ruta de conexión.
- Filtros por etiqueta, carpeta, fecha o tipo de nodo.
- "Constelaciones" guardadas: vistas guardadas del grafo para un tema específico (ej. "Clientes VIP", "Proveedores").
- Mini-mapa, barra de búsqueda y estadísticas dentro de la vista de grafo.

## 4. Editor avanzado
- Resaltado de código, tablas, fórmulas (LaTeX), "callouts" (cajas de nota/advertencia).
- Insertar y mostrar directamente PDF, video, audio, imágenes y sitios web embebidos dentro de una nota.

## 5. Modo oscuro/claro automático
- Que cambie solo según la hora del día o el modo del sistema (hoy el oscuro está fijo en el cerebro central).

## 6. Atajos de teclado
- Ej. Ctrl+N nueva nota, Ctrl+K buscar, Ctrl+G abrir grafo, Ctrl+P paleta de comandos.

## 7. Funciones "futuristas" (las marcadas como `futureFeatures` en tu spec)
- Línea de tiempo del conocimiento (ver cómo evolucionó con el tiempo).
- Vista de grafo en 3D.
- Pizarra blanca / canvas libre para organizar ideas visualmente.
- Mapas mentales.
- "Fuerza de relación" entre notas (qué tan conectadas están dos notas).
- Mapa de calor del conocimiento (qué temas tienes más documentados).
- Historial de cómo se ha visto/explorado el grafo.
- Fijar nodos importantes, guardar "rutas favoritas" entre notas.
- "Modo viaje" para navegar de un nodo a otro de forma animada, y animación del flujo de conocimiento.

---

**Sugerencia de orden** para lo que queda: primero importar archivos (PDF/imágenes), después el resto del grafo avanzado (zoom, clusters, constelaciones), y al final las funciones "futuristas" — eso último es lo más vistoso pero también lo más complejo.
