const { google } = require("googleapis");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getAuth() {
  const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  return new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
}

function getCalendarClient() {
  const auth = getAuth();
  return google.calendar({ version: "v3", auth });
}

const calendarId = () => process.env.GOOGLE_CALENDAR_ID;
const timezone = () => process.env.GOOGLE_TIMEZONE || "America/Mexico_City";

// Construye el instante UTC correcto para una hora "de pared" en la zona del negocio,
// sin depender de la zona horaria local del servidor (ej. Railway corre en UTC).
function zonedTimeToUtc(dateYmd, hour, minute, tz) {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const naiveUtc = new Date(Date.UTC(y, m - 1, d, Math.floor(hour), minute, 0));
  const tzAsUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: tz }));
  const utcAsUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = utcAsUtc.getTime() - tzAsUtc.getTime();
  return new Date(naiveUtc.getTime() + offset);
}

// Revisa si el rango [startIso, endIso) está libre en el calendario.
async function isSlotAvailable(startIso, endIso) {
  const calendar = getCalendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startIso,
      timeMax: endIso,
      timeZone: timezone(),
      items: [{ id: calendarId() }],
    },
  });
  const busy = res.data.calendars[calendarId()].busy || [];
  return busy.length === 0;
}

// Devuelve horarios disponibles para un día dado (lista de Date de inicio).
async function getAvailableSlotsForDay(dateYmd, openHour, closeHour, durationMin) {
  const calendar = getCalendarClient();
  const tz = timezone();
  const dayStart = zonedTimeToUtc(dateYmd, 0, 0, tz);
  const dayEnd = zonedTimeToUtc(dateYmd, 23, 59, tz);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: tz,
      items: [{ id: calendarId() }],
    },
  });
  const busy = (res.data.calendars[calendarId()].busy || []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  const slots = [];
  const now = new Date();
  for (let hour = openHour; hour < closeHour; ) {
    const slotStart = zonedTimeToUtc(dateYmd, Math.floor(hour), (hour % 1) * 60, tz);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
    const slotEndHourLocal = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(slotEnd).split(":")[0]
    );
    const slotEndMinuteLocal = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(slotEnd).split(":")[1]
    );
    if (slotEndHourLocal > closeHour || (slotEndHourLocal === closeHour && slotEndMinuteLocal > 0)) {
      break;
    }
    const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
    if (!overlaps && slotStart > now) {
      slots.push(slotStart);
    }
    hour += durationMin / 60;
  }
  return slots;
}

async function createEvent({ summary, description, startIso, endIso, phone }) {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: calendarId(),
    requestBody: {
      summary,
      description,
      start: { dateTime: startIso, timeZone: timezone() },
      end: { dateTime: endIso, timeZone: timezone() },
      extendedProperties: { private: { clientPhone: phone } },
    },
  });
  return res.data.id;
}

async function cancelEvent(eventId) {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({ calendarId: calendarId(), eventId });
  } catch (err) {
    if (err.code !== 404 && err.code !== 410) throw err;
  }
}

module.exports = {
  isSlotAvailable,
  getAvailableSlotsForDay,
  createEvent,
  cancelEvent,
};
