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
    source TEXT NOT NULL DEFAULT 'manual', -- manual | auto
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

function getAllUpcomingConfirmedAppointments() {
  return db
    .prepare(
      `SELECT * FROM appointments WHERE status = 'confirmed' AND start_iso > datetime('now')
       ORDER BY start_iso ASC`
    )
    .all();
}

function addKnowledge(content, source = "manual") {
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
  getAllUpcomingConfirmedAppointments,
  setPaused,
  isPaused,
  addKnowledge,
  getAllKnowledge,
  deleteKnowledge,
  logMessage,
  getRecentMessages,
};
