const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const conversation = require("../services/conversation");
const wa = require("../services/whatsapp");
const calendarSvc = require("../services/calendar");
const db = require("../services/db");

// Verificación del webhook (Meta hace un GET al configurar)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function verifySignature(req) {
  if (!process.env.WHATSAPP_APP_SECRET) return true; // permitir en desarrollo
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
      .update(req.rawBody)
      .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

router.post("/", async (req, res) => {
  // Respondemos rápido a Meta y procesamos después
  res.sendStatus(200);

  if (!verifySignature(req)) {
    console.warn("Firma de webhook inválida, ignorando mensaje");
    return;
  }

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // puede ser un evento de estado, no un mensaje

    const phone = message.from;
    console.log("Mensaje entrante de:", phone, "| contacto wa_id:", value?.contacts?.[0]?.wa_id);
    let text = "";
    if (message.type === "text") {
      text = message.text.body;
    } else if (message.type === "interactive") {
      text =
        message.interactive?.button_reply?.title ||
        message.interactive?.button_reply?.id ||
        "";
    } else {
      await wa.sendText(
        phone,
        "Por ahora solo puedo leer mensajes de texto. ¿Podrías escribirme tu mensaje?"
      );
      return;
    }

    // Comando especial del admin/equipo del negocio para cancelar una cita por id: "cancelar 12"
    if (
      process.env.ADMIN_WHATSAPP_NUMBER &&
      phone === process.env.ADMIN_WHATSAPP_NUMBER &&
      /^cancelar\s+\d+$/i.test(text.trim())
    ) {
      const id = parseInt(text.trim().split(/\s+/)[1], 10);
      await handleAdminCancel(id);
      return;
    }

    await conversation.handleIncomingMessage(phone, text);
  } catch (err) {
    console.error("Error procesando webhook de WhatsApp:", err);
  }
});

async function handleAdminCancel(appointmentId) {
  const appt = db.getAppointment(appointmentId);
  if (!appt || appt.status !== "confirmed") {
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `No encontré una cita activa con id ${appointmentId}.`
    );
    return;
  }
  try {
    await calendarSvc.cancelEvent(appt.calendar_event_id);
  } catch (err) {
    console.error("Error cancelando evento (admin):", err);
  }
  db.setAppointmentStatus(appt.id, "cancelled");
  db.resetConversation(appt.phone);
  await wa.sendText(
    appt.phone,
    `Hola ${appt.client_name}, lamentamos informarte que tu cita de ${appt.service} fue cancelada por nuestro equipo. ¿Te gustaría reagendar? Escribe "agendar" para elegir un nuevo horario.`
  );
  await wa.sendText(
    process.env.ADMIN_WHATSAPP_NUMBER,
    `Cancelé la cita ${appointmentId} de ${appt.client_name} y le avisé por WhatsApp.`
  );
}

module.exports = router;
