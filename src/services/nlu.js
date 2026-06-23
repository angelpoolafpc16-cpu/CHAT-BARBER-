const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function askForNumberOrNone(prompt) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 10,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].text.trim();
}

// Intenta identificar a qué servicio se refiere el texto libre del cliente.
// Devuelve el objeto de servicio o null si no hay coincidencia clara.
// serviciosCotizacion (opcional) son servicios sin precio fijo que se
// agendan como la opción de "reunión de descubrimiento" más cercana.
async function matchService(userText, servicios, serviciosCotizacion = []) {
  const listado = servicios.map((s, i) => `${i + 1}. ${s.nombre}`).join("\n");
  const cotizacionHint =
    serviciosCotizacion.length > 0
      ? `\n\nSi el cliente pide alguno de estos servicios que se cotizan a la medida (${serviciosCotizacion.join(
          ", "
        )}), elige el número de la opción de reunión de descubrimiento o similar de la lista anterior.`
      : "";
  const prompt = `El cliente escribió este mensaje a un negocio: "${userText}"

Estos son los servicios/opciones disponibles para agendar:
${listado}${cotizacionHint}

¿A cuál de estas opciones se refiere el cliente? Responde ÚNICAMENTE con el número de la opción (ej. "3"). Si el mensaje no se refiere claramente a ninguna de estas opciones, responde únicamente "0".`;

  try {
    const raw = await askForNumberOrNone(prompt);
    const idx = parseInt(raw.match(/\d+/)?.[0], 10);
    if (!idx || idx < 1 || idx > servicios.length) return null;
    return servicios[idx - 1];
  } catch (err) {
    console.error("Error en matchService (IA):", err);
    return null;
  }
}

// Intenta extraer una fecha (AAAA-MM-DD) de un texto libre, usando todayIso
// (AAAA-MM-DD) como referencia de "hoy". Devuelve la fecha o null.
async function parseDateFromText(userText, todayIso) {
  const prompt = `Hoy es ${todayIso}. El cliente escribió este mensaje para agendar una cita: "${userText}"

¿Qué fecha quiere el cliente? Responde ÚNICAMENTE con la fecha en formato AAAA-MM-DD. Si no menciona o no se puede determinar una fecha, responde únicamente "NONE".`;

  try {
    const raw = await askForNumberOrNone(prompt);
    const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[0] : null;
  } catch (err) {
    console.error("Error en parseDateFromText (IA):", err);
    return null;
  }
}

// Intenta identificar a qué cita(s) se refiere un texto libre del administrador
// (por nombre del cliente, servicio, fecha y/o hora), a partir de una lista de
// citas próximas. Devuelve un arreglo de ids que coinciden (puede estar vacío).
async function matchAppointmentsFromText(userText, appointments) {
  if (!appointments || appointments.length === 0) return [];

  const listado = appointments
    .map((a) => `id ${a.id}: ${a.client_name} - ${a.service} - ${a.fechaTexto}`)
    .join("\n");

  const prompt = `Un administrador de un negocio escribió este mensaje para cancelar una cita: "${userText}"

Estas son las citas próximas agendadas:
${listado}

¿A cuál o cuáles de estas citas se refiere? Responde ÚNICAMENTE con los ids que coincidan separados por coma (ej. "3" o "3,7"). Si no se refiere claramente a ninguna, responde únicamente "NONE".`;

  try {
    const raw = await askForNumberOrNone(prompt);
    if (/NONE/i.test(raw)) return [];
    const ids = raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && appointments.some((a) => a.id === n));
    return [...new Set(ids)];
  } catch (err) {
    console.error("Error en matchAppointmentsFromText (IA):", err);
    return [];
  }
}

module.exports = { matchService, parseDateFromText, matchAppointmentsFromText };
