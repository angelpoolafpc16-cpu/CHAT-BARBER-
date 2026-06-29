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
  res.send(PAGE_HTML);
});

router.get("/messages", (req, res) => {
  res.json(db.getRecentMessages(200));
});

router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const onMessage = (row) => {
    res.write(`data: ${JSON.stringify(row)}\n\n`);
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

const PAGE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Panel del bot</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f5f7; color: #1c1c1e; }
  header { background: #1c1c1e; color: white; padding: 16px; font-size: 18px; font-weight: 600; }
  .tabs { display: flex; background: white; border-bottom: 1px solid #ddd; }
  .tab { padding: 12px 20px; cursor: pointer; border-bottom: 3px solid transparent; }
  .tab.active { border-bottom-color: #1c1c1e; font-weight: 600; }
  .panel { display: none; padding: 16px; max-width: 800px; margin: 0 auto; }
  .panel.active { display: block; }
  .msg { padding: 10px 14px; border-radius: 10px; margin-bottom: 8px; max-width: 80%; }
  .msg.in { background: white; border: 1px solid #ddd; }
  .msg.out { background: #d1f0d1; margin-left: auto; }
  .meta { font-size: 11px; color: #888; margin-top: 4px; }
  .know-item { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 10px; }
  .know-item button { background: #e74c3c; color: white; border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  textarea, input[type=text] { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 6px; border: 1px solid #ccc; }
  button.add { margin-top: 8px; padding: 8px 16px; background: #1c1c1e; color: white; border: none; border-radius: 6px; cursor: pointer; }
</style>
</head>
<body>
<header>📊 Panel del bot</header>
<div class="tabs">
  <div class="tab active" data-tab="live">Mensajes en vivo</div>
  <div class="tab" data-tab="brain">Segundo cerebro</div>
</div>

<div class="panel active" id="live">
  <div id="messages"></div>
</div>

<div class="panel" id="brain">
  <textarea id="newKnowledge" rows="3" placeholder="Escribe algo para que el bot lo recuerde..."></textarea>
  <button class="add" onclick="addKnowledge()">Guardar</button>
  <div id="knowledgeList" style="margin-top:16px;"></div>
</div>

<script>
document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  };
});

function renderMessage(row) {
  const div = document.createElement("div");
  div.className = "msg " + row.direction;
  const time = new Date(row.created_at + "Z").toLocaleTimeString("es-MX");
  const respuesta = row.response_ms ? " · respondido en " + (row.response_ms / 1000).toFixed(1) + "s" : "";
  const safeText = row.text.replace(/</g, "&lt;");
  div.innerHTML = "<div>" + safeText + "</div><div class=\\"meta\\">" + row.phone + " · " + time + respuesta + "</div>";
  return div;
}

async function loadMessages() {
  const res = await fetch("messages");
  const rows = await res.json();
  const container = document.getElementById("messages");
  container.innerHTML = "";
  rows.forEach((r) => container.appendChild(renderMessage(r)));
  container.scrollTop = container.scrollHeight;
}

const evtSource = new EventSource("stream");
evtSource.onmessage = (e) => {
  const row = JSON.parse(e.data);
  const container = document.getElementById("messages");
  container.appendChild(renderMessage(row));
  container.scrollTop = container.scrollHeight;
};

async function loadKnowledge() {
  const res = await fetch("knowledge");
  const rows = await res.json();
  const list = document.getElementById("knowledgeList");
  list.innerHTML = "";
  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "know-item";
    const safeContent = row.content.replace(/</g, "&lt;");
    div.innerHTML = "<div>" + safeContent + "</div><button onclick=\\"deleteKnowledge(" + row.id + ")\\">Borrar</button>";
    list.appendChild(div);
  });
}

async function addKnowledge() {
  const textarea = document.getElementById("newKnowledge");
  const content = textarea.value.trim();
  if (!content) return;
  await fetch("knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
  textarea.value = "";
  loadKnowledge();
}

async function deleteKnowledge(id) {
  await fetch("knowledge/" + id, { method: "DELETE" });
  loadKnowledge();
}

loadMessages();
loadKnowledge();
</script>
</body>
</html>`;

module.exports = router;
