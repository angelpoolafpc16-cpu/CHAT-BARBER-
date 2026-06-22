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
  const dayStart = new Date(`${dateYmd}T00:00:00`);
  const dayEnd = new Date(`${dateYmd}T23:59:59`);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: timezone(),
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
    const slotStart = new Date(dateYmd + "T00:00:00");
    slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
    if (slotEnd.getHours() > closeHour || (slotEnd.getHours() === closeHour && slotEnd.getMinutes() > 0)) {
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
