# Segundo cerebro — funciones pendientes (roadmap futuro)

Lista de lo que pedías en el JSON original que **no** se implementó todavía, porque es un proyecto grande por sí solo. Lo que sí quedó listo: notas con etiqueta manual/auto, vista de lista en tarjetas, y una vista de grafo básica (nodos conectados por palabras en común, sin física).

Cuando quieras retomar algo de esto, dime cuál y lo planeamos como su propio proyecto.

## 1. Notas más completas (tipo Obsidian)
- Editor con Markdown / texto enriquecido (negritas, títulos, listas).
- Enlaces entre notas tipo `[[Nota]]` y "backlinks" (ver qué notas mencionan a otra).
- Alias y etiquetas (#tags) por nota.
- Notas diarias automáticas y plantillas reutilizables.
- Historial de versiones de cada nota (deshacer cambios).
- Pestañas / vista dividida (varias notas abiertas a la vez).

## 2. Importar archivos
- Arrastrar y soltar archivos o carpetas completas.
- Soporte para PDF, Word, Excel, PowerPoint, imágenes, audio, video, ZIP, etc.
- OCR (leer texto dentro de imágenes/PDFs escaneados).
- Extraer metadatos automáticamente y generar vista previa de cada archivo.
- Etiquetado y enlazado automático del contenido importado.

## 3. Grafo de conocimiento avanzado
- Físicas reales (nodos que se repelen/atraen, "respiran" solos, detectan colisiones).
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

**Sugerencia de orden** si decides retomarlo: primero notas con Markdown + tags + backlinks (es la base de todo lo demás), después importar archivos (PDF/imágenes), y al final el grafo avanzado con física — eso último es lo más vistoso pero también lo más complejo.
