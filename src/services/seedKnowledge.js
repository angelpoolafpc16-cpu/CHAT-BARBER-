const db = require("./db");

const SEED_MARKER = "seed-v1"; // change to re-seed after edits

const entries = [
  {
    title: "Identidad del negocio",
    content:
      "Nombre: Equipo Creativo. Atención 100% en línea (agenda tu reunión de descubrimiento por videollamada). Teléfono de contacto: +52 1 981 181 5486. Sitio web: https://www.equipocreativomid.com. Horario: Lunes a viernes de 9:00 am a 8:00 pm.",
  },
  {
    title: "Tono y estilo",
    content:
      "Tono del bot: Cercano, creativo, carismático y profesional. Uso estratégico de emojis para mantener la calidez, sin exagerar (no más de 1-2 por mensaje). No usar markdown (sin asteriscos, guiones de lista ni encabezados). Escribir en texto plano como WhatsApp.",
  },
  {
    title: "Paquete Esencial",
    content:
      "Paquete Esencial (redes sociales): 8 publicaciones al mes, imágenes y carruseles, copywriting, identidad visual, programación y reporte básico.",
  },
  {
    title: "Paquete Pro",
    content:
      "Paquete Pro (redes sociales): 12 publicaciones al mes, 2 Reels/TikToks, 8 historias, optimización de bio, respuesta a comentarios y reporte detallado.",
  },
  {
    title: "Paquete Premium",
    content:
      "Paquete Premium (redes sociales): 20 publicaciones al mes, 4 Reels/TikToks, 15 historias, campaña de Meta Ads, atención de mensajes directos, auditoría profunda y junta mensual por videollamada.",
  },
  {
    title: "Reunión de descubrimiento",
    content:
      "Reunión de descubrimiento (sin costo): Para branding, producción audiovisual, consultoría, flujos de trabajo con IA, desarrollo de páginas web o cualquier proyecto a medida. Se agenda esta reunión para conocer la marca y necesidades antes de cotizar.",
  },
  {
    title: "Servicios a cotizar",
    content:
      "Servicios que se cotizan a la medida tras la reunión de descubrimiento: Branding y diseño de logo, Producción audiovisual, Consultoría de marketing, Implementación de flujos de trabajo con IA, Desarrollo de páginas web.",
  },
  {
    title: "Proceso de venta",
    content:
      "Proceso de venta: El primer paso siempre es agendar una reunión de descubrimiento para conocer la marca y necesidades del cliente. Se debe solicitar el Manual de Identidad Visual del cliente; si no lo tiene, ofrecer el servicio de creación de uno.",
  },
  {
    title: "Tiempos de entrega",
    content:
      "Tiempos de entrega: Páginas web aproximadamente 2 semanas. Flujos de trabajo con IA hasta 1 mes. Otros servicios dependen de la complejidad; se da un tiempo estimado tras el análisis.",
  },
  {
    title: "Formas de pago y políticas",
    content:
      "Formas de pago: solo transferencias bancarias. Anticipo del 50% para iniciar cualquier proyecto. Vigencia de presupuestos: 15 días naturales. Política de cancelación: puedes cancelar o reagendar hasta 1 hora antes sin costo. Confidencialidad estricta de la información del cliente.",
  },
];

function seedDefaultKnowledge() {
  // Check if already seeded
  const existing = db.getAllKnowledge().find((e) => e.source === SEED_MARKER);
  if (existing) return;

  for (const e of entries) {
    db.db
      .prepare(
        "INSERT INTO knowledge (content, source, title, tags, aliases, is_daily) VALUES (?, ?, ?, '[]', '[]', 0)"
      )
      .run(e.content, SEED_MARKER, e.title);
  }
  console.log(`[seedKnowledge] ${entries.length} entradas del negocio migradas al cerebro.`);
}

module.exports = { seedDefaultKnowledge };
