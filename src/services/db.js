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
`);

function getConversation(phone) {
  const row = db
    .prepare("SELECT * FROM conversations WHERE phone = ?")
    .get(phone);
  if (!row) return { phone, state: "idle", data: {} };
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
};
