const axios = require("axios");
const liveMonitor = require("./liveMonitor");

const BASE_URL = "https://graph.facebook.com/v20.0";

function client() {
  return axios.create({
    baseURL: `${BASE_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

async function sendText(to, body) {
  try {
    await client().post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
    liveMonitor.recordOutgoing(to, body);
  } catch (err) {
    console.error(
      "Error enviando mensaje WhatsApp:",
      err.response?.data || err.message
    );
  }
}

async function sendButtons(to, bodyText, buttons) {
  try {
    await client().post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    });
    liveMonitor.recordOutgoing(to, `${bodyText} [botones: ${buttons.map((b) => b.title).join(", ")}]`);
  } catch (err) {
    console.error(
      "Error enviando botones WhatsApp:",
      err.response?.data || err.message
    );
  }
}

async function notifyAdminError(context, err) {
  const admin = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!admin) return;
  const detail = err?.response?.data?.error?.message || err?.message || String(err);
  await sendText(
    admin,
    `⚠️ Hubo un error técnico en el bot (${context}):\n${detail}\n\nRevisa la configuración o los logs de Railway para corregirlo.`
  );
}

module.exports = { sendText, sendButtons, notifyAdminError };
