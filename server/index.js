"use strict";

const path = require("node:path");
const express = require("express");
const auth = require("./auth");
const { getDb } = require("./db");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// Lightweight request logging (helps diagnose serving/browser issues).
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Initialize DB (creates schema + seeds question bank on first run)
getDb();

app.use(auth.authenticate);

app.get("/api/health", (req, res) => {
  const db = getDb();
  const c = db.prepare("SELECT COUNT(*) AS c FROM questions").get();
  res.json({ status: "ok", questions: c.c, time: new Date().toISOString() });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/catalog", require("./routes/catalog"));
app.use("/api/attempts", require("./routes/attempts"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/bookmarks", require("./routes/bookmarks"));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Static frontend (HTML must never be cached so code changes always apply)
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store, must-revalidate");
    },
  })
);
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[error]", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  Anesthesia Mock Exam Platform running at http://localhost:${PORT}\n`);
});

module.exports = app;
