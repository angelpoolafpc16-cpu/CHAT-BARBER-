const Anthropic = require("@anthropic-ai/sdk");
const business = require("../config/business");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt() {
  const serviciosTexto = business.servicios
    .map((s) => `- ${s.nombre}: $${s.precio}`)
    .join("\n");

  return `Eres el asistente de WhatsApp de "${business.nombre}". Respondes preguntas de clientes de forma breve, amable y directa (máximo 3-4 líneas, sin markdown).

Información del negocio:
Ubicación: ${business.ubicacion} (mapa: ${business.mapaUrl})
Horario: ${business.horario}
Teléfono: ${business.telefonoContacto}
Formas de pago: ${business.formasPago}
Política de cancelación: ${business.politicaCancelacion}

Servicios y precios:
${serviciosTexto}

Reglas:
- Si el cliente pregunta cómo agendar una cita, dile que puede escribir "agendar" o "quiero una cita" para iniciar el proceso.
- No inventes información que no esté aquí. Si no sabes algo, dilo y sugiere llamar al teléfono de contacto.
- No agendes citas tú mismo en esta respuesta, solo informa.`;
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

module.exports = { answerQuestion };
