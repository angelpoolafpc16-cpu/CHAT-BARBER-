const cron = require("node-cron");
const db = require("../services/db");
const wa = require("../services/whatsapp");

function start() {
  // Corre cada 5 minutos buscando citas que empiezan entre 55 y 65 min a partir de ahora
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const from = new Date(now.getTime() + 55 * 60000).toISOString();
      const to = new Date(now.getTime() + 65 * 60000).toISOString();
      const appts = db.getUpcomingAppointmentsNeedingReminder(from, to);

      for (const appt of appts) {
        const fecha = new Date(appt.start_iso).toLocaleString("es-MX", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: process.env.GOOGLE_TIMEZONE || "America/Mexico_City",
        });
        await wa.sendButtons(
          appt.phone,
          `Hola ${appt.client_name}, te recordamos tu cita de ${appt.service} hoy a las ${fecha}. ¿Sigue en pie?`,
          [
            { id: "reminder_yes", title: "Sí, asistiré" },
            { id: "reminder_no", title: "No, cancelar" },
          ]
        );
        db.saveConversation(appt.phone, "reminder_confirm", {
          appointmentId: appt.id,
        });
        db.markReminderSent(appt.id);
      }
    } catch (err) {
      console.error("Error en job de recordatorios:", err);
    }
  });
}

module.exports = { start };
