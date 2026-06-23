const Anthropic = require("@anthropic-ai/sdk");
const business = require("../config/business");
const db = require("./db");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ADMIN_NAME = process.env.ADMIN_NAME || "Ángel";

const AGENDA_KEYWORDS = [
  "resumen de la agenda",
  "resumen agenda",
  "que citas hay",
  "qué citas hay",
  "agenda de hoy",
  "como va la agenda",
  "cómo va la agenda",
  "mi agenda",
];

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function isAgendaRequest(text) {
  const n = normalize(text);
  return AGENDA_KEYWORDS.some((k) => n.includes(normalize(k)));
}

function buildAgendaSummary() {
  const appointments = db.getAllUpcomingConfirmedAppointments();
  if (appointments.length === 0) {
    return `Hola ${ADMIN_NAME}, no tienes citas próximas agendadas por ahora.`;
  }

  const listado = appointments
    .map((a) => {
      const fecha = new Date(a.start_iso).toLocaleString("es-MX", {
        dateStyle: "full",
        timeStyle: "short",
      });
      return `• ${fecha} — ${a.client_name} (${a.service})`;
    })
    .join("\n");

  return `Hola ${ADMIN_NAME}, este es el resumen de tu agenda (${appointments.length} cita${appointments.length === 1 ? "" : "s"} próxima${appointments.length === 1 ? "" : "s"}):\n\n${listado}`;
}

function buildSystemPrompt() {
  return `Eres el asistente personal de WhatsApp de ${ADMIN_NAME}, dueño de "${business.nombre}". Le hablas a él directamente, de forma cercana, breve y resolutiva, como un asistente de confianza (no como si fuera un cliente). Tutéalo y dirígete a él por su nombre cuando sea natural (ej. "Hola ${ADMIN_NAME}, ¿qué necesitas?").

Tu trabajo es ayudarle a administrar el negocio: dudas sobre la operación del bot, información rápida del negocio, o simplemente saludarlo y preguntarle en qué le puedes ayudar hoy.

Recuerda que también tiene estos comandos disponibles (menciónalos solo si pregunta cómo hacer algo, no en cada respuesta):
- "pausar <numero>" para que el bot deje de responder a un cliente y él tome el control.
- "responder <numero> <mensaje>" para escribirle a un cliente desde el número del negocio.
- "reanudar <numero>" para que el bot vuelva a responder a ese cliente.
- "cancelar <id>" para cancelar una cita específica.
- "cancelar todas mis citas" para cancelar todas las citas próximas y avisar a los clientes.
- Preguntas como "resumen de la agenda" para ver sus próximas citas.

No uses markdown (sin asteriscos, sin encabezados). Responde en texto plano. Máximo 4-5 líneas, salvo que de verdad se requiera más detalle. Puedes usar 1-2 emojis si aporta calidez.`;
}

async function handleAdminMessage(text) {
  if (isAgendaRequest(text)) {
    return buildAgendaSummary();
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: text }],
  });

  return response.content[0].text.trim();
}

module.exports = { handleAdminMessage };
