const EventEmitter = require("events");
const db = require("./db");

const emitter = new EventEmitter();
const pendingStart = new Map(); // phone -> timestamp del último mensaje entrante sin responder aún

function recordIncoming(phone, text) {
  pendingStart.set(phone, Date.now());
  const row = db.logMessage({ phone, direction: "in", text });
  emitter.emit("message", row);
  return row;
}

function recordOutgoing(phone, text) {
  const start = pendingStart.get(phone);
  const responseMs = start ? Date.now() - start : null;
  if (start) pendingStart.delete(phone);
  const row = db.logMessage({ phone, direction: "out", text, responseMs });
  emitter.emit("message", row);
  return row;
}

module.exports = { emitter, recordIncoming, recordOutgoing };
