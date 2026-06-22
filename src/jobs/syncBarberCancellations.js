const cron = require("node-cron");
const { google } = require("googleapis");
const path = require("path");
const db = require("../services/db");
const wa = require("../services/whatsapp");

function getCalendarClient() {
  const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  return google.calendar({ version: "v3", auth });
}

// Detecta cuando el barbero borra una cita directamente desde Google Calendar
// (en vez de hacerlo el cliente desde WhatsApp) y avisa al cliente automáticamente.
function start() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const calendar = getCalendarClient();
      const upcoming = db.db
        .prepare(
          `SELECT * FROM appointments WHERE status = 'confirmed' AND start_iso > datetime('now')`
        )
        .all();

      for (const appt of upcoming) {
        try {
          const res = await calendar.events.get({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            eventId: appt.calendar_event_id,
          });
          if (res.data.status === "cancelled") {
            await notifyClientOfBarberCancellation(appt);
          }
        } catch (err) {
          if (err.code === 404 || err.code === 410) {
            await notifyClientOfBarberCancellation(appt);
          } else {
            console.error("Error consultando evento:", err.message);
          }
        }
      }
    } catch (err) {
      console.error("Error en job de sincronización de cancelaciones:", err);
    }
  });
}

async function notifyClientOfBarberCancellation(appt) {
  db.setAppointmentStatus(appt.id, "cancelled");
  db.resetConversation(appt.phone);
  await wa.sendText(
    appt.phone,
    `Hola ${appt.client_name}, lamentamos informarte que tu cita de ${appt.service} fue cancelada por el barbero. ¿Te gustaría reagendar? Escribe "agendar" para elegir un nuevo horario.`
  );
}

module.exports = { start };
