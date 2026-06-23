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
async function matchService(userText, servicios) {
  const listado = servicios.map((s, i) => `${i + 1}. ${s.nombre}`).join("\n");
  const prompt = `El cliente escribió este mensaje a un negocio: "${userText}"

Estos son los servicios disponibles:
${listado}

¿A cuál de estos servicios se refiere el cliente? Responde ÚNICAMENTE con el número del servicio (ej. "3"). Si el mensaje no se refiere claramente a ninguno de estos servicios, responde únicamente "0".`;

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

module.exports = { matchService, parseDateFromText };
