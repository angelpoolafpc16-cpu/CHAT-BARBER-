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
  return entries
    .map((e) => `[id ${e.id}]${e.title ? ` ${e.title}:` : ""} ${e.content}`)
    .join("\n");
}

function parseWikilinks(content) {
  const matches = (content || "").match(/\[\[([^\]]+)\]\]/g) || [];
  return matches.map((m) => m.slice(2, -2).trim());
}

function parseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function noteMatchesName(note, name) {
  const n = name.trim().toLowerCase();
  if ((note.title || "").trim().toLowerCase() === n) return true;
  const aliases = parseJsonArray(note.aliases).map((a) => a.trim().toLowerCase());
  return aliases.includes(n);
}

function getBacklinks(noteId) {
  const target = db.getKnowledgeById(noteId);
  if (!target) return [];
  const allNotes = db.getAllNotes();
  const backlinks = [];
  for (const note of allNotes) {
    if (note.id === target.id) continue;
    const links = parseWikilinks(note.content);
    if (links.some((link) => noteMatchesName(target, link))) {
      backlinks.push(note);
    }
  }
  return backlinks;
}

function getAllNotes() {
  return db.getAllNotes().map((n) => ({
    ...n,
    tags: parseJsonArray(n.tags),
    aliases: parseJsonArray(n.aliases),
  }));
}

function getNote(id) {
  const note = db.getKnowledgeById(id);
  if (!note) return null;
  return {
    ...note,
    tags: parseJsonArray(note.tags),
    aliases: parseJsonArray(note.aliases),
    links: parseWikilinks(note.content),
    backlinks: getBacklinks(id),
  };
}

function createNote(data) {
  return db.createNote(data);
}

function updateNote(id, data) {
  return db.updateNote(id, data);
}

function getNoteVersions(id) {
  return db.getNoteVersions(id);
}

function restoreNoteVersion(id, versionId) {
  return db.restoreNoteVersion(id, versionId);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDailyNote() {
  const dateStr = todayDateStr();
  const label = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return db.ensureDailyNote(dateStr, label);
}

function addTemplate(name, content) {
  return db.addTemplate(name, content);
}

function getAllTemplates() {
  return db.getAllTemplates();
}

function deleteTemplate(id) {
  db.deleteTemplate(id);
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

module.exports = {
  addEntry,
  getAllEntries,
  deleteEntry,
  buildContext,
  maybeExtractAndSave,
  getAllNotes,
  getNote,
  createNote,
  updateNote,
  getNoteVersions,
  restoreNoteVersion,
  ensureDailyNote,
  addTemplate,
  getAllTemplates,
  deleteTemplate,
};
