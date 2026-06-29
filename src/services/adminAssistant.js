const Anthropic = require("@anthropic-ai/sdk");
const business = require("../config/business");
const db = require("./db");
const wa = require("./whatsapp");
const knowledge = require("./knowledge");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ADMIN_NAME = process.env.ADMIN_NAME || "Ángel";
const TIMEZONE = process.env.GOOGLE_TIMEZONE || "America/Mexico_City";

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

function formatAppointment(a) {
  const fecha = new Date(a.start_iso).toLocaleString("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: TIMEZONE,
  });
  return `id ${a.id} — ${fecha} — ${a.client_name} (${a.service}), tel ${a.phone}`;
}

function buildAgendaSummary() {
  const appointments = db.getAllUpcomingConfirmedAppointments();
  if (appointments.length === 0) {
    return `Hola ${ADMIN_NAME}, no tienes citas próximas agendadas por ahora.`;
  }

  const listado = appointments.map((a) => `• ${formatAppointment(a)}`).join("\n");

  return `Hola ${ADMIN_NAME}, este es el resumen de tu agenda (${appointments.length} cita${appointments.length === 1 ? "" : "s"} próxima${appointments.length === 1 ? "" : "s"}):\n\n${listado}`;
}

function buildAgendaContext() {
  const appointments = db.getAllUpcomingConfirmedAppointments();
  if (appointments.length === 0) {
    return "No hay citas próximas agendadas en este momento.";
  }
  return appointments.map((a) => formatAppointment(a)).join("\n");
}

function buildSystemPrompt() {
  return `Eres el asistente personal de WhatsApp de ${ADMIN_NAME}, dueño de "${business.nombre}". Le hablas a él directamente, de forma cercana, breve y resolutiva, como un asistente de confianza (no como si fuera un cliente). Tutéalo y dirígete a él por su nombre cuando sea natural (ej. "Hola ${ADMIN_NAME}, ¿qué necesitas?").

Tu trabajo es ayudarle a administrar el negocio: dudas sobre la operación del bot, información rápida del negocio, o simplemente saludarlo y preguntarle en qué le puedes ayudar hoy.

Tienes acceso TOTAL y en tiempo real a la agenda de citas del negocio. Estos son los datos reales y actuales (no son un ejemplo, son la agenda de verdad):
${buildAgendaContext()}

Si te pregunta cualquier cosa sobre la agenda, citas, horarios ocupados, cuántas citas hay, si hay alguna cita de cierto cliente, etc., respóndele usando estos datos reales directamente. NUNCA digas que no tienes acceso a la agenda, que depende de una configuración, o que hay que revisar la integración — siempre tienes acceso completo, como se muestra arriba.

Además tienes acceso TOTAL a tu "segundo cerebro": información que él mismo te ha ido contando (contactos, datos del negocio, notas, decisiones). Estos son los datos guardados ahí:
${knowledge.buildContext()}

Usa esa información cuando te preguntada algo relacionado (quién es alguien, su número, algo que te haya contado antes). NUNCA digas que no tienes acceso a esa información, siempre la tienes disponible como se muestra arriba.

Recuerda que también tiene estos comandos disponibles (menciónalos solo si pregunta cómo hacer algo, no en cada respuesta):
- "pausar <numero>" para que el bot deje de responder a un cliente y él tome el control.
- "responder <numero> <mensaje>" para escribirle a un cliente desde el número del negocio.
- "reanudar <numero>" para que el bot vuelva a responder a ese cliente.
- "cancelar <id>" para cancelar una cita específica, o "cancelar cita de <nombre/horario>" (ej. "cancelar cita de Fernanda" o "cancelar cita de las 3pm del jueves") para que el sistema busque y cancele la que coincida.
- "cancelar mis citas" o "cancelar mis citas de mañana/del jueves/etc" para cancelar varias citas a la vez (te mostrará cuántas y cuáles, y con un solo "sí" se ejecuta) y avisar a los clientes.
- Preguntas como "resumen de la agenda" para ver sus próximas citas.

No uses markdown (sin asteriscos, sin encabezados). Responde en texto plano. Máximo 4-5 líneas, salvo que de verdad se requiera más detalle. Puedes usar 1-2 emojis si aporta calidez.`;
}

function isExplicitRememberCommand(text) {
  return /^(recuerda|anota|guarda|agrega)\s+(que\s+)?/i.test(text.trim());
}

async function handleAdminMessage(text) {
  if (isAgendaRequest(text)) {
    return buildAgendaSummary();
  }

  if (isExplicitRememberCommand(text)) {
    const content = text.trim().replace(/^(recuerda|anota|guarda|agrega)\s+(que\s+)?/i, "");
    knowledge.addEntry(content, "manual");
    return "Listo, lo guardé en mi memoria. 🧠";
  }

  // Best-effort: si el mensaje trae info nueva digna de recordar, la guarda en segundo plano.
  knowledge.maybeExtractAndSave(text).catch(() => {});

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: text }],
    });

    return response.content[0].text.trim();
  } catch (err) {
    console.error("Error en adminAssistant.handleAdminMessage:", err);
    await wa.notifyAdminError("asistente personal del admin", err);
    return "Tuve un problema técnico procesando tu mensaje. Ya le avisé al número de administrador para revisarlo.";
  }
}

module.exports = { handleAdminMessage };
