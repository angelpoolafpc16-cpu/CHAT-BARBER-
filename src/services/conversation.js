const business = require("../config/business");
const ai = require("./ai");
const nlu = require("./nlu");
const calendarSvc = require("./calendar");
const wa = require("./whatsapp");
const db = require("./db");

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const MORE_SLOTS_KEYWORDS = ["otros horarios", "otra hora", "mas horarios", "más horarios", "ver todos"];

const BOOKING_KEYWORDS = [
  "agendar",
  "cita",
  "reservar",
  "apartar",
  "quiero una cita",
  "agenda",
];
const CANCEL_KEYWORDS = ["cancelar", "cancela mi cita", "no podre ir", "no podré ir"];
const AFFIRM = ["si", "sí", "claro", "ok", "va", "dale", "1"];
const DENY = ["no", "2"];

const OPEN_HOUR = Number(process.env.BUSINESS_OPEN_HOUR || 9);
const CLOSE_HOUR = Number(process.env.BUSINESS_CLOSE_HOUR || 20);
const DURATION_MIN = Number(process.env.APPOINTMENT_DURATION_MIN || 45);

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

function servicesMenuText() {
  return business.servicios
    .map((s, i) => `${i + 1}. ${s.nombre} - $${s.precio}`)
    .join("\n");
}

async function handleIncomingMessage(phone, text) {
  const convo = db.getConversation(phone);
  const state = convo.state;
  const data = convo.data;

  if (state === "idle") {
    if (includesAny(text, CANCEL_KEYWORDS)) {
      return handleClientCancelRequest(phone);
    }
    if (includesAny(text, BOOKING_KEYWORDS)) {
      return startBookingFlow(phone);
    }
    // Pregunta libre -> IA con info del negocio
    const answer = await ai.answerQuestion(text);
    await wa.sendText(phone, answer);
    return;
  }

  if (state === "booking_ask_service") {
    return handleServiceSelection(phone, text, data);
  }
  if (state === "booking_ask_name") {
    return handleNameInput(phone, text, data);
  }
  if (state === "booking_ask_date") {
    return handleDateInput(phone, text, data);
  }
  if (state === "booking_choose_slot") {
    return handleSlotSelection(phone, text, data);
  }
  if (state === "booking_confirm") {
    return handleBookingConfirmation(phone, text, data);
  }
  if (state === "reminder_confirm") {
    return handleReminderReply(phone, text, data);
  }

  // Fallback: reiniciar
  db.resetConversation(phone);
  const answer = await ai.answerQuestion(text);
  await wa.sendText(phone, answer);
}

async function startBookingFlow(phone) {
  db.saveConversation(phone, "booking_ask_service", {});
  await wa.sendText(
    phone,
    `¡Con gusto! ¿Qué servicio te gustaría agendar?\n${servicesMenuText()}\n\nResponde con el número o el nombre del servicio.`
  );
}

async function handleServiceSelection(phone, text, data) {
  const n = normalize(text);
  let service = null;
  const asNumber = parseInt(n, 10);
  if (!isNaN(asNumber) && business.servicios[asNumber - 1]) {
    service = business.servicios[asNumber - 1];
  } else {
    service = business.servicios.find((s) => n.includes(normalize(s.nombre)));
  }

  if (!service) {
    service = await nlu.matchService(text, business.servicios);
  }

  if (!service) {
    await wa.sendText(
      phone,
      `No reconocí ese servicio. Por favor elige una opción:\n${servicesMenuText()}`
    );
    return;
  }

  data.service = service.nombre;
  db.saveConversation(phone, "booking_ask_name", data);
  await wa.sendText(phone, "Perfecto. ¿Cuál es tu nombre completo?");
}

async function handleNameInput(phone, text, data) {
  if (!text || text.trim().length < 2) {
    await wa.sendText(phone, "¿Podrías escribir tu nombre completo, por favor?");
    return;
  }
  data.clientName = text.trim();
  db.saveConversation(phone, "booking_ask_date", data);
  await wa.sendText(
    phone,
    `Gracias, ${data.clientName}. ¿Para qué día te gustaría tu cita? (Ej: 2026-06-25 o "mañana")`
  );
}

function nextWeekday(targetDow) {
  const today = new Date();
  const diff = (targetDow - today.getDay() + 7) % 7 || 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function parseDateInput(text) {
  const n = normalize(text);
  const today = new Date();
  if (n.includes("hoy")) return today.toISOString().slice(0, 10);
  if (n.includes("manana") || n.includes("mañana")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const matchSlash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchSlash) {
    const [, d, m, y] = matchSlash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const weekdayIdx = WEEKDAYS.findIndex((w) => n.includes(w));
  if (weekdayIdx !== -1) return nextWeekday(weekdayIdx);

  return nlu.parseDateFromText(text, today.toISOString().slice(0, 10));
}

async function handleDateInput(phone, text, data) {
  const dateYmd = await parseDateInput(text);
  if (!dateYmd) {
    await wa.sendText(
      phone,
      'No entendí la fecha. Usa el formato AAAA-MM-DD (ej. 2026-06-25) o escribe "hoy" / "mañana".'
    );
    return;
  }

  const requested = new Date(`${dateYmd}T00:00:00`);
  if (requested < new Date(new Date().toDateString())) {
    await wa.sendText(phone, "Esa fecha ya pasó. ¿Para qué otro día te gustaría tu cita?");
    return;
  }

  let slots;
  try {
    slots = await calendarSvc.getAvailableSlotsForDay(
      dateYmd,
      OPEN_HOUR,
      CLOSE_HOUR,
      DURATION_MIN
    );
  } catch (err) {
    console.error("Error consultando disponibilidad:", err);
    await wa.sendText(
      phone,
      "Tuvimos un problema consultando la agenda. Intenta de nuevo en un momento."
    );
    return;
  }

  if (slots.length === 0) {
    await wa.sendText(
      phone,
      `No hay horarios disponibles ese día (${business.horario}). ¿Quieres intentar otra fecha?`
    );
    return;
  }

  data.dateYmd = dateYmd;
  data.slotsIso = slots.map((s) => s.toISOString());
  await sendSuggestedSlots(phone, data, slots);
}

function pickSuggestedSlots(slots) {
  const morning = slots.find((s) => s.getHours() < 14);
  const afternoon = slots.find((s) => s.getHours() >= 14);
  return [morning, afternoon].filter(Boolean);
}

async function sendSuggestedSlots(phone, data, slots) {
  const suggested = pickSuggestedSlots(slots);
  data.suggestedIso = suggested.map((s) => s.toISOString());
  db.saveConversation(phone, "booking_choose_slot", data);

  const listado = suggested
    .map(
      (s, i) =>
        `${i + 1}. ${s.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
    )
    .join("\n");
  await wa.sendText(
    phone,
    `Te sugiero estos horarios para ${data.dateYmd}:\n${listado}\n\nResponde con el número que prefieras, o escribe "otros horarios" para ver todas las opciones disponibles.`
  );
}

async function sendAllSlots(phone, data) {
  const slots = data.slotsIso || [];
  const listado = slots
    .map(
      (iso, i) =>
        `${i + 1}. ${new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
    )
    .join("\n");
  data.suggestedIso = null;
  db.saveConversation(phone, "booking_choose_slot", data);
  await wa.sendText(
    phone,
    `Horarios disponibles para ${data.dateYmd}:\n${listado}\n\nResponde con el número de la hora que prefieras.`
  );
}

async function handleSlotSelection(phone, text, data) {
  if (includesAny(text, MORE_SLOTS_KEYWORDS)) {
    return sendAllSlots(phone, data);
  }

  const idx = parseInt(normalize(text), 10) - 1;
  const slotsIso = (data.suggestedIso && data.suggestedIso.length > 0
    ? data.suggestedIso
    : data.slotsIso) || [];
  if (isNaN(idx) || !slotsIso[idx]) {
    await wa.sendText(phone, "Por favor responde con el número de uno de los horarios listados.");
    return;
  }

  const startIso = slotsIso[idx];
  const endIso = new Date(
    new Date(startIso).getTime() + DURATION_MIN * 60000
  ).toISOString();

  const available = await calendarSvc.isSlotAvailable(startIso, endIso);
  if (!available) {
    await wa.sendText(
      phone,
      "Ese horario ya no está disponible (alguien lo tomó). Por favor elige otro horario de la lista o escribe otra fecha."
    );
    db.saveConversation(phone, "booking_ask_date", data);
    return;
  }

  data.startIso = startIso;
  data.endIso = endIso;
  db.saveConversation(phone, "booking_confirm", data);

  const fecha = new Date(startIso).toLocaleString("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
  });
  await wa.sendText(
    phone,
    `Confirma tu cita:\nServicio: ${data.service}\nNombre: ${data.clientName}\nFecha y hora: ${fecha}\n\nResponde "sí" para confirmar o "no" para cancelar.`
  );
}

async function handleBookingConfirmation(phone, text, data) {
  if (includesAny(text, DENY)) {
    db.resetConversation(phone);
    await wa.sendText(phone, "Sin problema, cancelé el proceso. Escríbeme cuando quieras agendar de nuevo.");
    return;
  }
  if (!includesAny(text, AFFIRM)) {
    await wa.sendText(phone, 'Responde "sí" para confirmar tu cita o "no" para cancelar el proceso.');
    return;
  }

  let available;
  try {
    available = await calendarSvc.isSlotAvailable(data.startIso, data.endIso);
  } catch (err) {
    console.error("Error verificando disponibilidad final:", err);
    await wa.sendText(phone, "Tuvimos un problema confirmando tu cita. Intenta de nuevo.");
    return;
  }

  if (!available) {
    db.saveConversation(phone, "booking_ask_date", data);
    await wa.sendText(
      phone,
      "Justo se ocupó ese horario. ¿Para qué otra fecha te gustaría tu cita?"
    );
    return;
  }

  let eventId;
  try {
    eventId = await calendarSvc.createEvent({
      summary: `${data.service} - ${data.clientName}`,
      description: `Cliente: ${data.clientName}\nTeléfono: ${phone}\nServicio: ${data.service}`,
      startIso: data.startIso,
      endIso: data.endIso,
      phone,
    });
  } catch (err) {
    console.error("Error creando evento en Google Calendar:", err);
    await wa.sendText(phone, "No pudimos agendar tu cita en este momento. Intenta más tarde.");
    return;
  }

  db.createAppointment({
    phone,
    clientName: data.clientName,
    service: data.service,
    startIso: data.startIso,
    endIso: data.endIso,
    calendarEventId: eventId,
  });

  db.resetConversation(phone);

  const fecha = new Date(data.startIso).toLocaleString("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
  });
  await wa.sendText(
    phone,
    `¡Listo, ${data.clientName}! Tu cita quedó agendada:\n${data.service}\n${fecha}\n\n${business.politicaCancelacion}\nTe escribiremos 1 hora antes para confirmar. ¡Te esperamos en ${business.ubicacion}!`
  );

  if (process.env.ADMIN_WHATSAPP_NUMBER) {
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `Nueva cita agendada:\n${data.clientName} (${phone})\n${data.service}\n${fecha}`
    );
  }
}

async function handleClientCancelRequest(phone) {
  const appt = db.getActiveAppointmentForPhone(phone);
  if (!appt) {
    await wa.sendText(phone, "No encontré ninguna cita activa a tu nombre.");
    return;
  }
  try {
    await calendarSvc.cancelEvent(appt.calendar_event_id);
  } catch (err) {
    console.error("Error cancelando evento:", err);
  }
  db.setAppointmentStatus(appt.id, "cancelled");
  db.resetConversation(phone);
  await wa.sendText(
    phone,
    "Tu cita ha sido cancelada. Escríbeme cuando quieras agendar una nueva."
  );
  if (process.env.ADMIN_WHATSAPP_NUMBER) {
    await wa.sendText(
      process.env.ADMIN_WHATSAPP_NUMBER,
      `El cliente ${appt.client_name} (${phone}) canceló su cita del ${appt.start_iso}.`
    );
  }
}

async function handleReminderReply(phone, text, data) {
  const appt = db.getAppointment(data.appointmentId);
  if (!appt || appt.status !== "confirmed") {
    db.resetConversation(phone);
    return;
  }

  if (includesAny(text, AFFIRM)) {
    db.resetConversation(phone);
    await wa.sendText(phone, "¡Perfecto, te esperamos! Gracias por confirmar.");
    return;
  }

  if (includesAny(text, DENY)) {
    try {
      await calendarSvc.cancelEvent(appt.calendar_event_id);
    } catch (err) {
      console.error("Error cancelando evento desde recordatorio:", err);
    }
    db.setAppointmentStatus(appt.id, "cancelled");
    db.resetConversation(phone);
    await wa.sendText(
      phone,
      'Entendido, cancelé tu cita. Escríbeme "agendar" cuando quieras reservar un nuevo horario.'
    );
    if (process.env.ADMIN_WHATSAPP_NUMBER) {
      await wa.sendText(
        process.env.ADMIN_WHATSAPP_NUMBER,
        `${appt.client_name} (${phone}) canceló su cita de hoy (recordatorio).`
      );
    }
    return;
  }

  await wa.sendText(phone, '¿Tu cita sigue en pie? Responde "sí" o "no".');
}

module.exports = { handleIncomingMessage };
