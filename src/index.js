require("dotenv").config();
const express = require("express");
const { ensureGoogleCredentialsFile } = require("./services/bootstrap");

ensureGoogleCredentialsFile();

const webhookRouter = require("./routes/webhook");
const adminRouter = require("./routes/admin");
const remindersJob = require("./jobs/reminders");
const syncCancellationsJob = require("./jobs/syncCancellations");

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/webhook", webhookRouter);
app.use("/admin", adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot de WhatsApp escuchando en puerto ${PORT}`);
  remindersJob.start();
  syncCancellationsJob.start();
});
