const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const conversation = require("../services/conversation");
const wa = require("../services/whatsapp");
const calendarSvc = require("../services/calendar");
const db = require("../services/db");
const adminAssistant = require("../services/adminAssistant");
const nlu = require("../services/nlu");
const liveMonitor = require("../services/liveMonitor");
const contactMessenger = require("../services/contactMessenger");
const knowledge = require("../services/knowledge");

const TIMEZONE = process.env.GOOGLE_TIMEZONE || "America/Mexico_City";

const AFFIRM = ["si", "sí", "claro", "ok", "va", "dale", "confirmo", "adelante"];
const DENY = ["no", "cancela la operacion", "cancela la operación", "mejor no"];

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function includesAny(text, list) {
  const n = normalize(text);
  return list.some((k) => n.includes(normalize(k)));
}

// Detecta y parsea el formato fijo que manda el formulario web:
//   LEAD WEB
//   Nombre: ...
//   Telefono: ...
//   Motivo: ... (puede tener varias líneas)
function parseWebLead(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  const firstLine = raw.split(/\r?\n/)[0] || "";
  if (!normalize(firstLine).startsWith("lead web")) return null;

  const nameMatch = raw.match(/nombre\s*:\s*(.+)/i);
  const phoneMatch = raw.match(/tel[eé]fono\s*:\s*(.+)/i);
  const reasonMatch = raw.match(/motivo\s*:\s*([\s\S]+)/i);

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    leadPhone: phoneMatch ? phoneMatch[1].trim() : "",
    reason: reasonMatch ? reasonMatch[1].trim() : "",
  };
}

async function handleWebLead(phone, lead) {
  db.addWebLead({ phone, name: lead.name, leadPhone: lead.leadPhone, reason: lead.reason });
  knowledge.saveClientContact(lead.name, lead.leadPhone || phone);

  const displayName = lead.name || "";
  const greeting = displayName ? `¡Hola ${displayName}!` : "¡Hola!";
  await wa.sendText(
    phone,
    `${greeting} 👋 Gracias por contactar a Equipo Creativo. Recibimos tu mensaje y un miembro del equipo te responderá muy pronto para platicar sobre tu proyecto. 🚀`
  );

  if (process.env.ADMIN_WHATSAPP_NUMBER) {
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `📩 Nuevo lead del formulario web:\nNombre: ${lead.name || "(no especificado)"}\nTeléfono: ${lead.leadPhone || phone}\nMotivo: ${lead.reason || "(no especificado)"}`
    );
  }
}

function dateYmdInTimezone(date, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

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

    liveMonitor.recordIncoming(phone, text);

    // Lead del formulario web de Equipo Creativo: nunca entra al flujo de citas de la barbería.
    const webLead = parseWebLead(text);
    if (webLead) {
      await handleWebLead(phone, webLead);
      return;
    }

    // Comandos especiales del admin/equipo del negocio
    if (process.env.ADMIN_WHATSAPP_NUMBER && phone === process.env.ADMIN_WHATSAPP_NUMBER) {
      const trimmed = text.trim();

      // Si hay una cancelación masiva pendiente de confirmar, resolverla con un solo mensaje más.
      const pending = db.getConversation(phone);

      if (pending.state === "admin_confirm_send_message") {
        if (includesAny(trimmed, DENY)) {
          db.resetConversation(phone);
          await wa.sendText(phone, "Listo, no envié nada.");
          return;
        }
        if (includesAny(trimmed, AFFIRM)) {
          db.resetConversation(phone);
          await wa.sendText(pending.data.toPhone, pending.data.draftMessage);
          await wa.sendText(
            phone,
            `Listo, le envié el mensaje a ${pending.data.toName}.`
          );
          return;
        }
        await wa.sendText(
          phone,
          'Tengo un mensaje pendiente de confirmar. Responde "sí" para enviarlo o "no" para cancelarlo.'
        );
        return;
      }

      if (pending.state === "admin_awaiting_contact_phone") {
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length >= 7) {
          db.resetConversation(phone);
          knowledge.saveClientContact(pending.data.name, digits);
          await confirmDraftAndSend(phone, { name: pending.data.name, phone: digits }, pending.data.instructions);
          return;
        }
        await wa.sendText(
          phone,
          `Necesito un número de teléfono para guardar a "${pending.data.name}" y poder escribirle. Mándame el número.`
        );
        return;
      }

      if (pending.state === "admin_confirm_cancel_bulk") {
        if (includesAny(trimmed, DENY)) {
          db.resetConversation(phone);
          await wa.sendText(process.env.ADMIN_WHATSAPP_NUMBER, "Listo, no cancelé nada.");
          return;
        }
        if (includesAny(trimmed, AFFIRM)) {
          db.resetConversation(phone);
          await executeBulkCancel(pending.data.dateYmd);
          return;
        }
        await wa.sendText(
          process.env.ADMIN_WHATSAPP_NUMBER,
          'Tengo una cancelación pendiente de confirmar. Responde "sí" para proceder o "no" para cancelar la operación.'
        );
        return;
      }

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

      // Cancelación masiva: "cancela mis citas", "cancelar todas mis citas de mañana", etc.
      const cancelBulkMatch = trimmed.match(/^cancela(r)?\s+(todas\s+)?(mis|las)\s+citas(?:\s+(?:de\s+|del\s+)?(.+))?$/i);
      if (cancelBulkMatch) {
        await handleAdminCancelBulkRequest(phone, cancelBulkMatch[4]);
        return;
      }

      const cancelTextMatch = trimmed.match(/^cancela(r)?\s+(la\s+)?cita(s)?\s+(de\s+|del\s+|a\s+)?([\s\S]+)$/i);
      if (cancelTextMatch) {
        await handleAdminCancelByText(cancelTextMatch[5]);
        return;
      }

      // ¿Es una solicitud de enviar un mensaje a un contacto del "cerebro"?
      const sendIntent = await contactMessenger.detectSendIntent(text);
      if (sendIntent) {
        await handleAdminSendMessageRequest(phone, sendIntent);
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
    await wa.notifyAdminError("webhook de WhatsApp", err);
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

async function handleAdminCancelByText(queryText) {
  const appointments = db.getAllUpcomingConfirmedAppointments();
  if (appointments.length === 0) {
    await wa.sendText(process.env.ADMIN_WHATSAPP_NUMBER, "No hay citas próximas que cancelar.");
    return;
  }

  const withFecha = appointments.map((a) => ({
    ...a,
    fechaTexto: new Date(a.start_iso).toLocaleString("es-MX", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: TIMEZONE,
    }),
  }));

  const matchIds = await nlu.matchAppointmentsFromText(queryText, withFecha);

  if (matchIds.length === 0) {
    const listado = withFecha
      .map((a) => `id ${a.id}: ${a.client_name} - ${a.service} - ${a.fechaTexto}`)
      .join("\n");
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `No encontré ninguna cita que coincida con "${queryText}". Estas son las citas próximas:\n\n${listado}\n\nPuedes usar "cancelar <id>" para cancelar una específica.`
    );
    return;
  }

  if (matchIds.length > 1) {
    const matches = withFecha.filter((a) => matchIds.includes(a.id));
    const listado = matches
      .map((a) => `id ${a.id}: ${a.client_name} - ${a.service} - ${a.fechaTexto}`)
      .join("\n");
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `Encontré varias citas que podrían coincidir con "${queryText}":\n\n${listado}\n\nUsa "cancelar <id>" para cancelar la que quieras.`
    );
    return;
  }

  await handleAdminCancel(matchIds[0]);
}

// El admin pidió en lenguaje natural enviarle un mensaje a alguien del "cerebro" de contactos.
async function handleAdminSendMessageRequest(phone, sendIntent) {
  const contact = await contactMessenger.findContactPhone(sendIntent.name);
  if (!contact) {
    db.saveConversation(phone, "admin_awaiting_contact_phone", {
      name: sendIntent.name,
      instructions: sendIntent.instructions,
    });
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `No encontré el número de "${sendIntent.name}" en lo que tengo guardado. Dime su número para guardarlo y enviarle el mensaje.`
    );
    return;
  }

  await confirmDraftAndSend(phone, contact, sendIntent.instructions);
}

async function confirmDraftAndSend(phone, contact, instructions) {
  const draftMessage = await contactMessenger.draftMessage(contact, instructions);
  db.saveConversation(phone, "admin_confirm_send_message", {
    toPhone: contact.phone,
    toName: contact.name,
    draftMessage,
  });
  await wa.sendText(
    process.env.ADMIN_WHATSAPP_NUMBER,
    `¿Envío este mensaje a ${contact.name} (${contact.phone})?\n\n"${draftMessage}"\n\nResponde "sí" para enviarlo o "no" para cancelarlo.`
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

function appointmentsForScope(dateYmd) {
  const appointments = db.getAllUpcomingConfirmedAppointments();
  if (!dateYmd) return appointments;
  return appointments.filter((a) => dateYmdInTimezone(new Date(a.start_iso), TIMEZONE) === dateYmd);
}

// Primer paso: revisa cuántas citas aplican y pide una única confirmación.
async function handleAdminCancelBulkRequest(phone, dateText) {
  let dateYmd = null;
  if (dateText && dateText.trim()) {
    const todayYmd = dateYmdInTimezone(new Date(), TIMEZONE);
    dateYmd = await nlu.parseDateFromText(dateText, todayYmd);
  }

  const appointments = appointmentsForScope(dateYmd);
  if (appointments.length === 0) {
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      dateYmd ? `No hay citas próximas ese día (${dateYmd}).` : "No hay citas próximas que cancelar."
    );
    return;
  }

  db.saveConversation(phone, "admin_confirm_cancel_bulk", { dateYmd });
  const listado = appointments
    .map((a) => `• ${a.client_name} - ${a.service} - ${new Date(a.start_iso).toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: TIMEZONE })}`)
    .join("\n");
  await wa.sendText(
    process.env.ADMIN_WHATSAPP_NUMBER,
    `Vas a cancelar ${appointments.length} cita(s)${dateYmd ? ` del ${dateYmd}` : ""} y le avisaré a cada cliente para que reagende:\n\n${listado}\n\nResponde "sí" para confirmar o "no" para no hacer nada.`
  );
}

// Segundo paso: ya confirmado, ejecuta la cancelación real.
async function executeBulkCancel(dateYmd) {
  const appointments = appointmentsForScope(dateYmd);

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
