const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "negocio.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    phone TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'idle',
    data TEXT NOT NULL DEFAULT '{}',
    paused INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    client_name TEXT,
    service TEXT,
    start_iso TEXT NOT NULL,
    end_iso TEXT NOT NULL,
    calendar_event_id TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | completed
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', -- manual | auto | daily
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    knowledge_id INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS note_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS imported_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    file_type TEXT NOT NULL, -- pdf | word | excel | image | vcf
    size INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT,
    note_id INTEGER,
    status TEXT NOT NULL DEFAULT 'processing', -- processing | done | error
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL, -- in | out
    text TEXT NOT NULL,
    response_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migración para bases de datos creadas antes de que existiera la columna "paused".
try {
  db.exec("ALTER TABLE conversations ADD COLUMN paused INTEGER NOT NULL DEFAULT 0");
} catch (err) {
  // La columna ya existe, no hay nada que hacer.
}

// Migraciones para las nuevas columnas de notas tipo Obsidian.
const knowledgeMigrations = [
  "ALTER TABLE knowledge ADD COLUMN title TEXT",
  "ALTER TABLE knowledge ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE knowledge ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE knowledge ADD COLUMN is_daily INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE knowledge ADD COLUMN daily_date TEXT",
  "ALTER TABLE knowledge ADD COLUMN updated_at TEXT",
];
for (const sql of knowledgeMigrations) {
  try {
    db.exec(sql);
  } catch (err) {
    // La columna ya existe, no hay nada que hacer.
  }
}

function getConversation(phone) {
  const row = db
    .prepare("SELECT * FROM conversations WHERE phone = ?")
    .get(phone);
  if (!row) return { phone, state: "idle", data: {}, paused: 0 };
  return { ...row, data: JSON.parse(row.data) };
}

function saveConversation(phone, state, data) {
  db.prepare(
    `INSERT INTO conversations (phone, state, data, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(phone) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at`
  ).run(phone, state, JSON.stringify(data || {}));
}

function resetConversation(phone) {
  saveConversation(phone, "idle", {});
}

function setPaused(phone, paused) {
  const exists = db.prepare("SELECT phone FROM conversations WHERE phone = ?").get(phone);
  if (!exists) {
    db.prepare(
      "INSERT INTO conversations (phone, state, data, paused) VALUES (?, 'idle', '{}', ?)"
    ).run(phone, paused ? 1 : 0);
  } else {
    db.prepare("UPDATE conversations SET paused = ? WHERE phone = ?").run(
      paused ? 1 : 0,
      phone
    );
  }
}

function isPaused(phone) {
  const row = db.prepare("SELECT paused FROM conversations WHERE phone = ?").get(phone);
  return !!(row && row.paused);
}

function createAppointment(appt) {
  const result = db
    .prepare(
      `INSERT INTO appointments (phone, client_name, service, start_iso, end_iso, calendar_event_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`
    )
    .run(
      appt.phone,
      appt.clientName,
      appt.service,
      appt.startIso,
      appt.endIso,
      appt.calendarEventId
    );
  return result.lastInsertRowid;
}

function getAppointment(id) {
  return db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
}

function getAppointmentByEventId(eventId) {
  return db
    .prepare("SELECT * FROM appointments WHERE calendar_event_id = ?")
    .get(eventId);
}

function getUpcomingAppointmentsNeedingReminder(fromIso, toIso) {
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE status = 'confirmed' AND reminder_sent = 0
       AND start_iso BETWEEN ? AND ?`
    )
    .all(fromIso, toIso);
}

function markReminderSent(id) {
  db.prepare("UPDATE appointments SET reminder_sent = 1 WHERE id = ?").run(id);
}

function setAppointmentStatus(id, status) {
  db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(
    status,
    id
  );
}

function getActiveAppointmentForPhone(phone) {
  return db
    .prepare(
      `SELECT * FROM appointments WHERE phone = ? AND status = 'confirmed'
       ORDER BY start_iso ASC LIMIT 1`
    )
    .get(phone);
}

function getAppointmentsByPhone(phone) {
  return db
    .prepare("SELECT * FROM appointments WHERE phone = ? ORDER BY created_at DESC")
    .all(phone);
}

function getAllUpcomingConfirmedAppointments() {
  return db
    .prepare(
      `SELECT * FROM appointments WHERE status = 'confirmed' AND start_iso > datetime('now')
       ORDER BY start_iso ASC`
    )
    .all();
}

function addKnowledge(content, source = "manual", title = null) {
  if (title) {
    const result = db.prepare(
      "INSERT INTO knowledge (content, source, title, tags, aliases, is_daily) VALUES (?, ?, ?, '[]', '[]', 0)"
    ).run(content, source, title);
    return result.lastInsertRowid;
  }
  const result = db
    .prepare("INSERT INTO knowledge (content, source) VALUES (?, ?)")
    .run(content, source);
  return result.lastInsertRowid;
}

function getAllKnowledge() {
  return db.prepare("SELECT * FROM knowledge ORDER BY created_at DESC").all();
}

function deleteKnowledge(id) {
  db.prepare("DELETE FROM knowledge WHERE id = ?").run(id);
  db.prepare("DELETE FROM knowledge_versions WHERE knowledge_id = ?").run(id);
}

function updateKnowledge(id, content) {
  db.prepare("UPDATE knowledge SET content = ? WHERE id = ?").run(content.trim(), id);
}

function getKnowledgeById(id) {
  return db.prepare("SELECT * FROM knowledge WHERE id = ?").get(id);
}

function createNote({ title, content, tags = [], aliases = [], source = "manual", isDaily = false, dailyDate = null }) {
  const result = db
    .prepare(
      `INSERT INTO knowledge (content, source, title, tags, aliases, is_daily, daily_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      content,
      source,
      title || null,
      JSON.stringify(tags || []),
      JSON.stringify(aliases || []),
      isDaily ? 1 : 0,
      dailyDate
    );
  return getKnowledgeById(result.lastInsertRowid);
}

function updateNote(id, { title, content, tags, aliases }) {
  const existing = getKnowledgeById(id);
  if (!existing) return null;

  db.prepare(
    "INSERT INTO knowledge_versions (knowledge_id, title, content) VALUES (?, ?, ?)"
  ).run(id, existing.title, existing.content);

  db.prepare(
    `UPDATE knowledge SET title = ?, content = ?, tags = ?, aliases = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title !== undefined ? title : existing.title,
    content !== undefined ? content : existing.content,
    tags !== undefined ? JSON.stringify(tags) : existing.tags,
    aliases !== undefined ? JSON.stringify(aliases) : existing.aliases,
    id
  );

  return getKnowledgeById(id);
}

function getAllNotes() {
  return db
    .prepare("SELECT * FROM knowledge ORDER BY COALESCE(updated_at, created_at) DESC")
    .all();
}

function getNoteVersions(knowledgeId) {
  return db
    .prepare("SELECT * FROM knowledge_versions WHERE knowledge_id = ? ORDER BY created_at DESC")
    .all(knowledgeId);
}

function restoreNoteVersion(knowledgeId, versionId) {
  const version = db
    .prepare("SELECT * FROM knowledge_versions WHERE id = ? AND knowledge_id = ?")
    .get(versionId, knowledgeId);
  if (!version) return null;
  return updateNote(knowledgeId, { title: version.title, content: version.content });
}

function getDailyNote(dateStr) {
  return db
    .prepare("SELECT * FROM knowledge WHERE is_daily = 1 AND daily_date = ?")
    .get(dateStr);
}

function ensureDailyNote(dateStr, defaultTitle) {
  const existing = getDailyNote(dateStr);
  if (existing) return existing;
  return createNote({
    title: defaultTitle,
    content: "",
    source: "daily",
    isDaily: true,
    dailyDate: dateStr,
  });
}

function addTemplate(name, content) {
  const result = db
    .prepare("INSERT INTO note_templates (name, content) VALUES (?, ?)")
    .run(name, content);
  return db.prepare("SELECT * FROM note_templates WHERE id = ?").get(result.lastInsertRowid);
}

function getAllTemplates() {
  return db.prepare("SELECT * FROM note_templates ORDER BY created_at DESC").all();
}

function deleteTemplate(id) {
  db.prepare("DELETE FROM note_templates WHERE id = ?").run(id);
}

function createImportedFile({ originalName, storedName, mimeType, fileType, size }) {
  const result = db
    .prepare(
      `INSERT INTO imported_files (original_name, stored_name, mime_type, file_type, size)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(originalName, storedName, mimeType || null, fileType, size || 0);
  return db.prepare("SELECT * FROM imported_files WHERE id = ?").get(result.lastInsertRowid);
}

function updateImportedFile(id, { extractedText, noteId, status, errorMessage }) {
  const existing = db.prepare("SELECT * FROM imported_files WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare(
    `UPDATE imported_files SET extracted_text = ?, note_id = ?, status = ?, error_message = ?
     WHERE id = ?`
  ).run(
    extractedText !== undefined ? extractedText : existing.extracted_text,
    noteId !== undefined ? noteId : existing.note_id,
    status !== undefined ? status : existing.status,
    errorMessage !== undefined ? errorMessage : existing.error_message,
    id
  );
  return db.prepare("SELECT * FROM imported_files WHERE id = ?").get(id);
}

function getAllImportedFiles() {
  return db.prepare("SELECT * FROM imported_files ORDER BY created_at DESC").all();
}

function getImportedFile(id) {
  return db.prepare("SELECT * FROM imported_files WHERE id = ?").get(id);
}

function deleteImportedFile(id) {
  db.prepare("DELETE FROM imported_files WHERE id = ?").run(id);
}

function logMessage({ phone, direction, text, responseMs }) {
  const result = db
    .prepare(
      "INSERT INTO message_log (phone, direction, text, response_ms) VALUES (?, ?, ?, ?)"
    )
    .run(phone, direction, text, responseMs ?? null);
  return db.prepare("SELECT * FROM message_log WHERE id = ?").get(result.lastInsertRowid);
}

function getRecentMessages(limit = 100) {
  return db
    .prepare("SELECT * FROM message_log ORDER BY id DESC LIMIT ?")
    .all(limit)
    .reverse();
}

function getMessagesByPhone(phone, limit = 20) {
  return db
    .prepare("SELECT * FROM message_log WHERE phone = ? ORDER BY id DESC LIMIT ?")
    .all(phone, limit)
    .reverse();
}

module.exports = {
  db,
  getConversation,
  saveConversation,
  resetConversation,
  createAppointment,
  getAppointment,
  getAppointmentByEventId,
  getUpcomingAppointmentsNeedingReminder,
  markReminderSent,
  setAppointmentStatus,
  getActiveAppointmentForPhone,
  getAppointmentsByPhone,
  getAllUpcomingConfirmedAppointments,
  setPaused,
  isPaused,
  addKnowledge,
  getAllKnowledge,
  deleteKnowledge,
  updateKnowledge,
  getKnowledgeById,
  createNote,
  updateNote,
  getAllNotes,
  getNoteVersions,
  restoreNoteVersion,
  getDailyNote,
  ensureDailyNote,
  addTemplate,
  getAllTemplates,
  deleteTemplate,
  logMessage,
  getRecentMessages,
  getMessagesByPhone,
  createImportedFile,
  updateImportedFile,
  getAllImportedFiles,
  getImportedFile,
  deleteImportedFile,
};
