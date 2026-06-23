const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const conversation = require("../services/conversation");
const wa = require("../services/whatsapp");
const calendarSvc = require("../services/calendar");
const db = require("../services/db");
const adminAssistant = require("../services/adminAssistant");

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

    // Comandos especiales del admin/equipo del negocio
    if (process.env.ADMIN_WHATSAPP_NUMBER && phone === process.env.ADMIN_WHATSAPP_NUMBER) {
      const trimmed = text.trim();

      if (/^cancelar\s+\d+$/i.test(trimmed)) {
        const id = parseInt(trimmed.split(/\s+/)[1], 10);
        await handleAdminCancel(id);
        return;
      }

      const pausarMatch = trimmed.match(/^pausar\s+(\d+)$/i);
      if (pausarMatch) {
        await handleAdminPause(pausarMatch[1], true);
        return;
      }

      const reanudarMatch = trimmed.match(/^reanudar\s+(\d+)$/i);
      if (reanudarMatch) {
        await handleAdminPause(reanudarMatch[1], false);
        return;
      }

      const responderMatch = trimmed.match(/^responder\s+(\d+)\s+([\s\S]+)$/i);
      if (responderMatch) {
        await handleAdminReply(responderMatch[1], responderMatch[2]);
        return;
      }

      if (/^cancela(r)?\s+todas\s+(mis|las)\s+citas$/i.test(trimmed)) {
        await handleAdminCancelAll();
        return;
      }

      // Ningún comando especial coincidió: lo atiende el asistente personal del admin.
      const reply = await adminAssistant.handleAdminMessage(text);
      await wa.sendText(phone, reply);
      return;
    }

    if (db.isPaused(phone)) {
      // El admin está atendiendo esta conversación manualmente; el bot no responde.
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

async function handleAdminPause(phone, paused) {
  db.setPaused(phone, paused);
  await wa.sendText(
    process.env.ADMIN_WHATSAPP_NUMBER,
    paused
      ? `Listo, pausé al bot para el número ${phone}. Usa "responder ${phone} <mensaje>" para escribirle, y "reanudar ${phone}" cuando termines.`
      : `Listo, reanudé las respuestas automáticas del bot para el número ${phone}.`
  );
}

async function handleAdminReply(phone, message) {
  if (!db.isPaused(phone)) {
    db.setPaused(phone, true);
  }
  await wa.sendText(phone, message.trim());
}

async function handleAdminCancelAll() {
  const appointments = db.getAllUpcomingConfirmedAppointments();

  if (appointments.length === 0) {
    await wa.sendText(process.env.ADMIN_WHATSAPP_NUMBER, "No hay citas próximas que cancelar.");
    return;
  }

  for (const appt of appointments) {
    try {
      await calendarSvc.cancelEvent(appt.calendar_event_id);
    } catch (err) {
      console.error("Error cancelando evento (cancelar todas):", err);
    }
    db.setAppointmentStatus(appt.id, "cancelled");
    db.resetConversation(appt.phone);
    await wa.sendText(
      appt.phone,
      `Hola ${appt.client_name}, lamentamos informarte que tu cita de ${appt.service} fue cancelada por nuestro equipo. ¿Te gustaría reagendar? Escribe "agendar" para elegir un nuevo horario.`
    );
  }

  await wa.sendText(
    process.env.ADMIN_WHATSAPP_NUMBER,
    `Cancelé ${appointments.length} cita(s) y avisé a cada cliente para que reagende.`
  );
}

module.exports = router;
