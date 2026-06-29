const express = require("express");
const router = express.Router();

const db = require("../services/db");
const knowledge = require("../services/knowledge");
const liveMonitor = require("../services/liveMonitor");

function basicAuth(req, res, next) {
  const user = process.env.ADMIN_PANEL_USER;
  const pass = process.env.ADMIN_PANEL_PASSWORD;
  if (!user || !pass) {
    return res.status(503).send("Panel no configurado: define ADMIN_PANEL_USER y ADMIN_PANEL_PASSWORD.");
  }
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === user && p === pass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Panel admin"');
  return res.status(401).send("Autenticación requerida.");
}

router.use(basicAuth);

router.get("/", (req, res) => {
  res.send(buildPageHtml());
});

router.get("/messages", (req, res) => {
  res.json(db.getRecentMessages(500));
});

router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const onMessage = (row) => {
    res.write("data: " + JSON.stringify(row) + "\n\n");
  };
  liveMonitor.emitter.on("message", onMessage);

  req.on("close", () => {
    liveMonitor.emitter.off("message", onMessage);
  });
});

router.get("/knowledge", (req, res) => {
  res.json(knowledge.getAllEntries());
});

router.post("/knowledge", express.json(), (req, res) => {
  const content = (req.body?.content || "").trim();
  if (!content) return res.status(400).json({ error: "content requerido" });
  const id = knowledge.addEntry(content, "manual");
  res.json({ id });
});

router.delete("/knowledge/:id", (req, res) => {
  knowledge.deleteEntry(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

router.get("/contact/:phone", (req, res) => {
  const phone = req.params.phone;
  const appointments = db.getAppointmentsByPhone(phone);
  const name = appointments.find((a) => a.client_name)?.client_name || null;
  const notes = knowledge
    .getAllEntries()
    .filter((e) => e.content.includes(phone))
    .map((e) => e.content);
  res.json({ phone, name, appointments, notes });
});

function buildPageHtml() {
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || "";
  return PAGE_HEAD + 'const ADMIN_PHONE = "' + adminPhone.replace(/"/g, "") + '";\n' + PAGE_SCRIPT;
}

const PAGE_HEAD = [
  "<!DOCTYPE html>",
  '<html lang="es">',
  "<head>",
  '<meta charset="utf-8" />',
  "<title>Panel del bot</title>",
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  "<style>",
  "  * { box-sizing: border-box; }",
  "  body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; margin: 0; background: #FFFFFF; color: #000000; height: 100vh; overflow: hidden; }",
  "  header { background: #1c1c1e; color: white; padding: 14px 16px; font-size: 16px; font-weight: 600; }",
  "  .tabs { display: flex; background: white; border-bottom: 1px solid #E5E5EA; }",
  "  .tab { padding: 12px 20px; cursor: pointer; border-bottom: 3px solid transparent; font-size: 14px; }",
  "  .tab.active { border-bottom-color: #0A84FF; font-weight: 600; color: #0A84FF; }",
  "  .panel { display: none; }",
  "  .panel.active { display: flex; }",
  "  #live { height: calc(100vh - 96px); }",
  "",
  "  .sidebar { width: 280px; min-width: 220px; border-right: 1px solid #E5E5EA; overflow-y: auto; background: #F5F5F7; }",
  "  .contact { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #ECECEE; }",
  "  .contact:hover { background: #ECECEE; }",
  "  .contact.active { background: #E1EBFF; }",
  "  .contact .name { font-weight: 600; font-size: 14px; color: #000; }",
  "  .contact .preview { font-size: 12px; color: #8E8E93; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  "  .contact .time { font-size: 11px; color: #8E8E93; float: right; }",
  "",
  "  .chat-area { flex: 1; display: flex; flex-direction: column; }",
  "  .chat-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #E5E5EA; background: #F9F9FB; }",
  "  .chat-header .user-icon-btn { width: 32px; height: 32px; border-radius: 50%; background: #C7C7CC; color: white; border: none; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }",
  "  .chat-header .user-icon-btn:hover { background: #aeaeb2; }",
  "  .chat-header .chat-title { font-size: 14px; font-weight: 600; color: #000; }",
  "  .chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; }",
  "  .empty-state { margin: auto; color: #8E8E93; font-size: 14px; text-align: center; }",
  "",
  "  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.35); align-items: center; justify-content: center; z-index: 50; }",
  "  .modal-overlay.open { display: flex; }",
  "  .modal-box { background: white; border-radius: 14px; padding: 20px; width: 320px; max-width: 90vw; max-height: 80vh; overflow-y: auto; }",
  "  .modal-box h3 { margin: 0 0 12px; font-size: 16px; }",
  "  .modal-box .field { margin-bottom: 10px; }",
  "  .modal-box .field .label { font-size: 11px; color: #8E8E93; text-transform: uppercase; }",
  "  .modal-box .field .value { font-size: 14px; color: #000; margin-top: 2px; }",
  "  .modal-box .appt-item, .modal-box .note-item { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #ECECEE; }",
  "  .modal-box .close-btn { margin-top: 14px; width: 100%; padding: 10px; background: #1c1c1e; color: white; border: none; border-radius: 8px; cursor: pointer; }",
  "",
  "  .bubble-row { display: flex; flex-direction: column; margin-bottom: 4px; max-width: 72%; position: relative; animation: bubbleIn 250ms cubic-bezier(0.2,0.8,0.2,1); }",
  "  .bubble-row.sent { align-self: flex-end; align-items: flex-end; }",
  "  .bubble-row.received { align-self: flex-start; align-items: flex-start; }",
  "  .bubble-row.group-start { margin-top: 12px; }",
  "",
  "  .bubble { border-radius: 22px; padding: 12px 16px; font-size: 16px; font-weight: 400; line-height: 1.35; box-shadow: 0 1px 1px rgba(0,0,0,0.05); word-wrap: break-word; }",
  "  .bubble.sent { background: #0A84FF; color: #FFFFFF; }",
  "  .bubble.received { background: #E9E9EB; color: #000000; }",
  "",
  "  .copy-btn { position: absolute; top: -10px; right: -10px; background: white; border: 1px solid #E5E5EA; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 150ms; }",
  "  .bubble-row.sent:hover .copy-btn { opacity: 1; }",
  "",
  "  .timestamp { font-size: 12px; font-weight: 400; color: #8E8E93; margin-top: 4px; }",
  "",
  "  @keyframes bubbleIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }",
  "",
  '  .brain-panel { padding: 16px; max-width: 800px; margin: 0 auto; flex-direction: column; width: 100%; }',
  "  .know-item { background: white; border: 1px solid #E5E5EA; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 10px; }",
  "  .know-item button { background: #e74c3c; color: white; border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; }",
  "  textarea { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-family: inherit; }",
  "  button.add { margin-top: 8px; padding: 8px 16px; background: #1c1c1e; color: white; border: none; border-radius: 6px; cursor: pointer; }",
  "",
  "  @media (min-width: 768px) { .bubble-row { max-width: 60%; } }",
  "  @media (min-width: 1100px) { .bubble-row { max-width: 50%; } }",
  "</style>",
  "</head>",
  "<body>",
  "<header>📊 Panel del bot</header>",
  '<div class="tabs">',
  '  <div class="tab active" data-tab="live">Mensajes</div>',
  '  <div class="tab" data-tab="brain">Segundo cerebro</div>',
  "</div>",
  "",
  '<div class="panel active" id="live">',
  '  <div class="sidebar" id="contactList"></div>',
  '  <div class="chat-area">',
  '    <div class="chat-header" id="chatHeader" style="display:none;">',
  '      <button class="user-icon-btn" id="contactInfoBtn" onclick="openContactInfo()">👤</button>',
  '      <div class="chat-title" id="chatTitle"></div>',
  "    </div>",
  '    <div class="chat-messages" id="chatMessages"><div class="empty-state">Selecciona un contacto para ver la conversación</div></div>',
  "  </div>",
  "</div>",
  "",
  '<div class="modal-overlay" id="contactModal">',
  '  <div class="modal-box" id="contactModalBody"></div>',
  "</div>",
  "",
  '<div class="panel brain-panel" id="brain">',
  '  <textarea id="newKnowledge" rows="3" placeholder="Escribe algo para que el bot lo recuerde..."></textarea>',
  '  <button class="add" onclick="addKnowledge()">Guardar</button>',
  '  <div id="knowledgeList" style="margin-top:16px;"></div>',
  "</div>",
  "",
  "<script>",
].join("\n");

const PAGE_SCRIPT = [
  'document.querySelectorAll(".tab").forEach(function (tab) {',
  "  tab.onclick = function () {",
  '    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });',
  '    document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });',
  '    tab.classList.add("active");',
  "    document.getElementById(tab.dataset.tab).classList.add(\"active\");",
  "  };",
  "});",
  "",
  "var allMessages = [];",
  "var selectedPhone = null;",
  "",
  "function contactLabel(phone) {",
  '  if (phone === ADMIN_PHONE) return "Admin (tú)";',
  "  return phone;",
  "}",
  "",
  "function escapeHtml(text) {",
  '  return text.replace(/</g, "&lt;");',
  "}",
  "",
  "function formatTime(iso) {",
  '  return new Date(iso + "Z").toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });',
  "}",
  "",
  "function groupByPhone(messages) {",
  "  var map = {};",
  "  messages.forEach(function (m) {",
  "    if (!map[m.phone]) map[m.phone] = [];",
  "    map[m.phone].push(m);",
  "  });",
  "  return map;",
  "}",
  "",
  "function renderContactList() {",
  "  var grouped = groupByPhone(allMessages);",
  "  var phones = Object.keys(grouped);",
  "  phones.sort(function (a, b) {",
  "    var lastA = grouped[a][grouped[a].length - 1];",
  "    var lastB = grouped[b][grouped[b].length - 1];",
  "    return new Date(lastB.created_at) - new Date(lastA.created_at);",
  "  });",
  '  var container = document.getElementById("contactList");',
  '  container.innerHTML = "";',
  "  phones.forEach(function (phone) {",
  "    var msgs = grouped[phone];",
  "    var last = msgs[msgs.length - 1];",
  '    var div = document.createElement("div");',
  '    div.className = "contact" + (phone === selectedPhone ? " active" : "");',
  "    div.onclick = function () { selectContact(phone); };",
  '    div.innerHTML = "<div class=\\"time\\">" + formatTime(last.created_at) + "</div>" +',
  '      "<div class=\\"name\\">" + escapeHtml(contactLabel(phone)) + "</div>" +',
  '      "<div class=\\"preview\\">" + escapeHtml(last.text) + "</div>";',
  "    container.appendChild(div);",
  "  });",
  "}",
  "",
  "function renderBubble(row) {",
  '  var direction = row.direction === "out" ? "sent" : "received";',
  '  var rowDiv = document.createElement("div");',
  '  rowDiv.className = "bubble-row " + direction;',
  "",
  '  var bubble = document.createElement("div");',
  '  bubble.className = "bubble " + direction;',
  "  bubble.textContent = row.text;",
  "  rowDiv.appendChild(bubble);",
  "",
  '  if (direction === "sent") {',
  '    var copyBtn = document.createElement("button");',
  '    copyBtn.className = "copy-btn";',
  '    copyBtn.title = "Copiar mensaje";',
  '    copyBtn.textContent = "📋";',
  "    copyBtn.onclick = function (e) {",
  "      e.stopPropagation();",
  "      navigator.clipboard.writeText(row.text).then(function () {",
  '        copyBtn.textContent = "✓";',
  '        setTimeout(function () { copyBtn.textContent = "📋"; }, 1200);',
  "      });",
  "    };",
  "    rowDiv.appendChild(copyBtn);",
  "  }",
  "",
  '  var time = document.createElement("div");',
  '  time.className = "timestamp";',
  "  time.textContent = formatTime(row.created_at);",
  "  rowDiv.appendChild(time);",
  "",
  "  return rowDiv;",
  "}",
  "",
  "function selectContact(phone) {",
  "  selectedPhone = phone;",
  "  renderContactList();",
  "  renderChat();",
  '  document.getElementById("chatHeader").style.display = "flex";',
  '  document.getElementById("chatTitle").textContent = contactLabel(phone);',
  "}",
  "",
  "async function openContactInfo() {",
  "  if (!selectedPhone) return;",
  '  var res = await fetch("/admin/contact/" + selectedPhone);',
  "  var info = await res.json();",
  '  var body = document.getElementById("contactModalBody");',
  '  var html = "<h3>" + escapeHtml(contactLabel(selectedPhone)) + "</h3>";',
  '  html += "<div class=\\"field\\"><div class=\\"label\\">Número</div><div class=\\"value\\">" + escapeHtml(selectedPhone) + "</div></div>";',
  '  html += "<div class=\\"field\\"><div class=\\"label\\">Nombre</div><div class=\\"value\\">" + escapeHtml(info.name || "Sin nombre registrado") + "</div></div>";',
  '  html += "<div class=\\"field\\"><div class=\\"label\\">Citas</div>";',
  "  if (info.appointments.length === 0) {",
  '    html += "<div class=\\"value\\">Sin citas registradas</div>";',
  "  } else {",
  "    info.appointments.forEach(function (a) {",
  '      html += "<div class=\\"appt-item\\">" + escapeHtml(a.service || "Servicio") + " — " + escapeHtml(a.start_iso) + " (" + escapeHtml(a.status) + ")</div>";',
  "    });",
  "  }",
  '  html += "</div>";',
  '  html += "<div class=\\"field\\"><div class=\\"label\\">Notas del segundo cerebro</div>";',
  "  if (info.notes.length === 0) {",
  '    html += "<div class=\\"value\\">Sin notas</div>";',
  "  } else {",
  "    info.notes.forEach(function (n) {",
  '      html += "<div class=\\"note-item\\">" + escapeHtml(n) + "</div>";',
  "    });",
  "  }",
  '  html += "</div>";',
  '  html += "<button class=\\"close-btn\\" onclick=\\"closeContactInfo()\\">Cerrar</button>";',
  "  body.innerHTML = html;",
  '  document.getElementById("contactModal").classList.add("open");',
  "}",
  "",
  "function closeContactInfo() {",
  '  document.getElementById("contactModal").classList.remove("open");',
  "}",
  "",
  "function renderChat() {",
  '  var container = document.getElementById("chatMessages");',
  '  container.innerHTML = "";',
  "  if (!selectedPhone) {",
  '    container.innerHTML = "<div class=\\"empty-state\\">Selecciona un contacto para ver la conversación</div>";',
  "    return;",
  "  }",
  "  var grouped = groupByPhone(allMessages);",
  "  var msgs = grouped[selectedPhone] || [];",
  "  msgs.forEach(function (row) { container.appendChild(renderBubble(row)); });",
  "  container.scrollTop = container.scrollHeight;",
  "}",
  "",
  "async function loadMessages() {",
  '  var res = await fetch("/admin/messages");',
  "  allMessages = await res.json();",
  "  renderContactList();",
  "  renderChat();",
  "}",
  "",
  'var evtSource = new EventSource("/admin/stream");',
  "evtSource.onmessage = function (e) {",
  "  var row = JSON.parse(e.data);",
  "  allMessages.push(row);",
  "  renderContactList();",
  "  if (row.phone === selectedPhone) {",
  '    var container = document.getElementById("chatMessages");',
  "    container.appendChild(renderBubble(row));",
  "    container.scrollTop = container.scrollHeight;",
  "  }",
  "};",
  "",
  "async function loadKnowledge() {",
  '  var res = await fetch("/admin/knowledge");',
  "  var rows = await res.json();",
  '  var list = document.getElementById("knowledgeList");',
  '  list.innerHTML = "";',
  "  rows.forEach(function (row) {",
  '    var div = document.createElement("div");',
  '    div.className = "know-item";',
  "    var safeContent = escapeHtml(row.content);",
  '    div.innerHTML = "<div>" + safeContent + "</div><button onclick=\\"deleteKnowledge(" + row.id + ")\\">Borrar</button>";',
  "    list.appendChild(div);",
  "  });",
  "}",
  "",
  "async function addKnowledge() {",
  '  var textarea = document.getElementById("newKnowledge");',
  "  var content = textarea.value.trim();",
  "  if (!content) return;",
  '  await fetch("/admin/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content }) });',
  '  textarea.value = "";',
  "  loadKnowledge();",
  "}",
  "",
  "async function deleteKnowledge(id) {",
  '  await fetch("/admin/knowledge/" + id, { method: "DELETE" });',
  "  loadKnowledge();",
  "}",
  "",
  "loadMessages();",
  "loadKnowledge();",
  "</script>",
  "</body>",
  "</html>",
].join("\n");

module.exports = router;
