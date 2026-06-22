require("dotenv").config();
const express = require("express");
const webhookRouter = require("./routes/webhook");
const remindersJob = require("./jobs/reminders");
const syncCancellationsJob = require("./jobs/syncBarberCancellations");

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chat Barber escuchando en puerto ${PORT}`);
  remindersJob.start();
  syncCancellationsJob.start();
});
