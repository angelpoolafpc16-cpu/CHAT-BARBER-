// Edita aquí la información del negocio. El bot usa estos datos tanto para
// respuestas directas (ubicación, horario) como contexto para la IA.
// Esta misma estructura sirve para cualquier tipo de negocio: solo cambia
// los valores (nombre, servicios, precios, horario, etc.) y el bot se
// adapta automáticamente, sin tocar el código.
module.exports = {
  nombre: "Equipo Creativo",
  ubicacion: "Atención en oficina y en línea (agenda tu reunión de descubrimiento)",
  mapaUrl: "https://maps.app.goo.gl/ejemplo",
  horario: "Lunes a viernes de 9:00 am a 8:00 pm.",
  telefonoContacto: "+52 1 981 181 5486",
  sitioWeb: "https://www.equipocreativomid.com",

  // Tono y estilo con el que la IA debe responder.
  tono: "Cercano, creativo, carismático y profesional",
  estiloComunicacion:
    "Uso estratégico de emojis para mantener la calidez, sin exagerar (no más de 1-2 por mensaje).",

  // Servicios que se pueden agendar directamente (paquetes con precio fijo,
  // más una reunión de descubrimiento para todo lo que se cotiza a la medida).
  servicios: [
    {
      nombre: "Paquete Esencial (redes sociales)",
      precio: 1800,
      detalles:
        "8 publicaciones al mes, imágenes/carruseles, copywriting, identidad visual, programación, reporte básico.",
    },
    {
      nombre: "Paquete Pro (redes sociales)",
      precio: 3900,
      detalles:
        "12 publicaciones al mes, 2 Reels/TikToks, 8 historias, optimización de bio, respuesta a comentarios, reporte detallado.",
    },
    {
      nombre: "Paquete Premium (redes sociales)",
      precio: 5700,
      detalles:
        "20 publicaciones al mes, 4 Reels/TikToks, 15 historias, campaña de Meta Ads, atención de mensajes directos, auditoría profunda, junta mensual por videollamada.",
    },
    {
      nombre: "Reunión de descubrimiento",
      precio: 0,
      detalles:
        "Para branding, producción audiovisual, consultoría, flujos de trabajo con IA, desarrollo de páginas web o cualquier proyecto a medida. Se agenda esta reunión para conocer la marca y necesidades antes de cotizar.",
    },
  ],

  // Servicios que NO tienen precio fijo: se cotizan a la medida tras la
  // reunión de descubrimiento. La IA debe guiar al cliente a agendarla.
  serviciosCotizacion: [
    "Branding y diseño de logo",
    "Producción audiovisual",
    "Consultoría de marketing",
    "Implementación de flujos de trabajo con IA",
    "Desarrollo de páginas web",
  ],

  procesoVenta: {
    primerPaso:
      "Agendar una reunión de descubrimiento para conocer la marca y necesidades del cliente.",
    requisitosCliente:
      "Solicitar el Manual de Identidad Visual del cliente; si no lo tiene, ofrecer el servicio de creación de uno.",
  },

  tiemposEntrega: {
    paginasWeb: "Aproximadamente 2 semanas.",
    flujosTrabajoIA: "Hasta 1 mes.",
    otrosServicios: "Depende de la complejidad; se da un tiempo estimado tras el análisis.",
  },

  formasPago: "Solo transferencias bancarias.",
  politicaCancelacion:
    "Puedes cancelar o reagendar hasta 1 hora antes de tu cita sin costo.",
  politicasProteccion: {
    anticipo: "Se requiere el 50% de anticipo para iniciar cualquier proyecto.",
    metodoPago: "Solo transferencias bancarias.",
    vigenciaPresupuesto: "Los presupuestos tienen una vigencia de 15 días naturales.",
    confidencialidad: "Toda la información del cliente se trata con estricta confidencialidad.",
  },
};
