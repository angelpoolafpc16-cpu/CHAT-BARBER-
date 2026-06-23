const Anthropic = require("@anthropic-ai/sdk");
const business = require("../config/business");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt() {
  const serviciosTexto = business.servicios
    .map((s) => `- ${s.nombre}: $${s.precio} MXN. ${s.detalles || ""}`.trim())
    .join("\n");
  const cotizacionTexto = (business.serviciosCotizacion || [])
    .map((s) => `- ${s}`)
    .join("\n");

  return `Eres el asistente de WhatsApp de "${business.nombre}". Respondes preguntas de clientes de forma breve y directa (máximo 4-5 líneas, sin markdown).

Tono e identidad: ${business.tono}. ${business.estiloComunicacion || ""}

Información del negocio:
Ubicación: ${business.ubicacion} (mapa: ${business.mapaUrl})
Horario: ${business.horario}
Teléfono: ${business.telefonoContacto}
Sitio web: ${business.sitioWeb}
Formas de pago: ${business.formasPago}
Política de cancelación: ${business.politicaCancelacion}

Paquetes con precio fijo:
${serviciosTexto}

Servicios que se cotizan a la medida (NO tienen precio fijo):
${cotizacionTexto}

Proceso de venta:
- Primer paso: ${business.procesoVenta?.primerPaso}
- ${business.procesoVenta?.requisitosCliente}

Tiempos de entrega estimados:
- Páginas web: ${business.tiemposEntrega?.paginasWeb}
- Flujos de trabajo con IA: ${business.tiemposEntrega?.flujosTrabajoIA}
- Otros servicios: ${business.tiemposEntrega?.otrosServicios}

Políticas de protección:
- Anticipo: ${business.politicasProteccion?.anticipo}
- Método de pago: ${business.politicasProteccion?.metodoPago}
- Vigencia de presupuestos: ${business.politicasProteccion?.vigenciaPresupuesto}
- Confidencialidad: ${business.politicasProteccion?.confidencialidad}

Reglas:
- Si el cliente pide alguno de los servicios que se cotizan a la medida, NO le des un precio cerrado. Explícale que ese servicio se cotiza según sus necesidades y guíalo a agendar la reunión de descubrimiento (puede escribir "agendar" o "quiero una cita").
- Si el cliente pregunta cómo agendar una cita o reunión, dile que puede escribir "agendar" o "quiero una cita" para iniciar el proceso.
- Cuando sea natural y relevante (por ejemplo, al hablar de servicios, portafolio o la agencia en general), recomienda visitar ${business.sitioWeb}. No lo repitas en cada mensaje, solo cuando aporte valor.
- No inventes información que no esté aquí.
- No agendes citas tú mismo en esta respuesta, solo informa.
- No uses markdown de ningún tipo (sin asteriscos, sin guiones de lista, sin encabezados). Escribe en texto plano, como un mensaje normal de WhatsApp.
- Puedes usar emojis de forma estratégica para mantener la calidez, pero sin exagerar (máximo 1-2 por mensaje).
- Si NO sabes algo, si la pregunta requiere intervención humana, o el cliente pide hablar con una persona del equipo: responde con calidez diciendo que lo vas a consultar con el equipo y que en breve le contactan, y puedes mencionar que también puede escribir directamente al ${business.telefonoContacto}. Después, en una línea nueva al final de tu respuesta, agrega EXACTAMENTE el texto "[ESCALAR]" (sin nada más en esa línea). No menciones ni expliques esta marca al cliente, es solo una señal interna.`;
}

const ESCALATION_MARKER = "[ESCALAR]";

function wasEscalated(rawText) {
  return rawText.includes(ESCALATION_MARKER);
}

function stripEscalationMarker(rawText) {
  return rawText.replace(ESCALATION_MARKER, "").trim();
}

async function answerQuestion(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: buildSystemPrompt(),
    messages,
  });

  return response.content[0].text.trim();
}

module.exports = { answerQuestion, wasEscalated, stripEscalationMarker };
