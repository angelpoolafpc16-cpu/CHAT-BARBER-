const Anthropic = require("@anthropic-ai/sdk");
const knowledge = require("./knowledge");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function ask(prompt, maxTokens = 200) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content[0].text.trim();
}

// Detecta si el admin está pidiendo enviarle un mensaje a un tercero por WhatsApp.
// Devuelve { name, instructions } o null si no es ese tipo de petición.
async function detectSendIntent(text) {
  const prompt = `Un administrador de un negocio le escribió esto a su asistente personal por WhatsApp: "${text}"

¿Está pidiendo que se le envíe un mensaje de WhatsApp a otra persona (un cliente, proveedor, conocido, etc.) en su nombre? NO cuenta si está hablando de un cliente del negocio en el flujo normal de citas (pausar/responder/cancelar), solo cuenta si es una petición libre del tipo "envíale/mándale/dile/escríbele a <nombre> ...".

Si SÍ, responde ÚNICAMENTE con un JSON de una línea así: {"name": "<nombre de la persona>", "instructions": "<qué se le quiere decir o preguntar, en las palabras del admin>"}
Si NO, responde ÚNICAMENTE con "NONE".`;

  try {
    const raw = await ask(prompt);
    if (/^NONE$/i.test(raw)) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.name || !parsed.instructions) return null;
    return parsed;
  } catch (err) {
    console.error("Error en contactMessenger.detectSendIntent:", err);
    return null;
  }
}

// Busca en el "cerebro" (knowledge) el número de teléfono asociado a un nombre.
// Devuelve { name, phone } o null si no encuentra nada claro.
async function findContactPhone(name) {
  const context = knowledge.buildContext();
  const prompt = `Esta es la información guardada sobre contactos y datos del negocio:
${context}

¿Cuál es el número de teléfono de "${name}"? Responde ÚNICAMENTE con un JSON de una línea así: {"name": "<nombre tal como aparece>", "phone": "<número, solo dígitos, formato internacional sin +>"}
Si no encuentras un número claro para esa persona, responde ÚNICAMENTE con "NONE".`;

  try {
    const raw = await ask(prompt);
    if (/^NONE$/i.test(raw)) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.phone) return null;
    return { name: parsed.name || name, phone: parsed.phone.replace(/\D/g, "") };
  } catch (err) {
    console.error("Error en contactMessenger.findContactPhone:", err);
    return null;
  }
}

// Redacta el mensaje de WhatsApp que se le enviaría al contacto.
async function draftMessage(contact, instructions) {
  const context = knowledge.buildContext();
  const prompt = `Información guardada sobre contactos y el negocio:
${context}

Redacta un mensaje de WhatsApp breve y natural en español para enviarle a ${contact.name}, de parte del dueño del negocio, con esta intención: "${instructions}".

Responde ÚNICAMENTE con el texto del mensaje, sin comillas, sin explicaciones, sin markdown.`;

  try {
    return await ask(prompt, 300);
  } catch (err) {
    console.error("Error en contactMessenger.draftMessage:", err);
    return instructions;
  }
}

module.exports = { detectSendIntent, findContactPhone, draftMessage };
