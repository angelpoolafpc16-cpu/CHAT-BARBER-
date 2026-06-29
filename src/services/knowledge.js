const Anthropic = require("@anthropic-ai/sdk");
const db = require("./db");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function addEntry(content, source = "manual") {
  return db.addKnowledge(content.trim(), source);
}

function getAllEntries() {
  return db.getAllKnowledge();
}

function deleteEntry(id) {
  db.deleteKnowledge(id);
}

function buildContext() {
  const entries = db.getAllKnowledge();
  if (entries.length === 0) return "No hay nada guardado todavía.";
  return entries.map((e) => `[id ${e.id}] ${e.content}`).join("\n");
}

// Revisa si el mensaje del admin trae información nueva que valga la pena guardar
// (un contacto, un dato del negocio, una decisión, etc.) y la guarda automáticamente.
// Es "best effort": si falla, simplemente no guarda nada.
async function maybeExtractAndSave(text) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Un administrador de un negocio le escribió esto a su asistente personal: "${text}"

¿Contiene información nueva que valga la pena recordar a futuro (un contacto y su número, un dato del negocio, una decisión, un precio, una nota sobre un cliente, etc.)? Si NO, responde únicamente "NONE". Si SÍ, responde únicamente con una frase corta y clara que resuma ese dato para guardarlo (en tercera persona, sin saludos, ej. "Claudia es clienta, su número es 5512345678, se le presentó una propuesta de remodelación.").`,
        },
      ],
    });
    const raw = response.content[0].text.trim();
    if (!raw || /^NONE$/i.test(raw)) return null;
    return addEntry(raw, "auto");
  } catch (err) {
    console.error("Error en knowledge.maybeExtractAndSave:", err);
    return null;
  }
}

module.exports = { addEntry, getAllEntries, deleteEntry, buildContext, maybeExtractAndSave };
