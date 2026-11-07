"use strict";

const express = require("express");
const { getDb, rowToQuestion } = require("../db");

const router = express.Router();

function buildFilter(query, { eligibleOnly = false } = {}) {
  const where = [];
  const params = [];
  if (query.subject) {
    where.push("subject = ?");
    params.push(query.subject);
  }
  if (query.topic) {
    where.push("topic = ?");
    params.push(query.topic);
  }
  if (query.source) {
    where.push("source_pdf = ?");
    params.push(query.source);
  }
  if (query.search) {
    where.push("(question LIKE ? OR options LIKE ?)");
    const like = `%${query.search}%`;
    params.push(like, like);
  }
  if (eligibleOnly) where.push("eligible = 1");
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  return { clause, params };
}

router.get("/subjects", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT subject, topic,
              COUNT(*) AS total,
              SUM(eligible) AS eligible
         FROM questions
        GROUP BY subject, topic
        ORDER BY subject, topic`
    )
    .all();

  const map = new Map();
  for (const r of rows) {
    const subject = r.subject || "Uncategorized";
    if (!map.has(subject)) {
      map.set(subject, { subject, total: 0, eligible: 0, topics: [] });
    }
    const entry = map.get(subject);
    entry.total += r.total;
    entry.eligible += r.eligible;
    entry.topics.push({ topic: r.topic || "General", total: r.total, eligible: r.eligible });
  }
  const subjects = [...map.values()].sort((a, b) => b.total - a.total);
  res.json({ subjects });
});

router.get("/sources", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT source_pdf AS source, COUNT(*) AS total, SUM(eligible) AS eligible
         FROM questions GROUP BY source_pdf ORDER BY total DESC`
    )
    .all();
  res.json({ sources: rows });
});

router.get("/summary", (req, res) => {
  const db = getDb();
  const q = db.prepare("SELECT COUNT(*) AS total, SUM(eligible) AS eligible FROM questions").get();
  const subjects = db.prepare("SELECT COUNT(DISTINCT subject) AS c FROM questions").get();
  const topics = db.prepare("SELECT COUNT(DISTINCT topic) AS c FROM questions").get();
  const withAnswers = db
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE correct_answer IS NOT NULL AND correct_answer != ''")
    .get();
  const withExplanations = db
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE explanation IS NOT NULL AND explanation != ''")
    .get();
  const flagged = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE needs_manual_review = 1").get();
  res.json({
    totalQuestions: q.total,
    examEligible: q.eligible,
    subjects: subjects.c,
    topics: topics.c,
    withAnswers: withAnswers.c,
    withExplanations: withExplanations.c,
    flaggedForReview: flagged.c,
  });
});

router.get("/questions", (req, res) => {
  const db = getDb();
  const { clause, params } = buildFilter(req.query, { eligibleOnly: req.query.eligible === "1" });
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM questions ${clause}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM questions ${clause} ORDER BY subject, source_number LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ total, page, limit, pages: Math.ceil(total / limit), questions: rows.map(rowToQuestion) });
});

router.get("/questions/:id", (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Question not found" });
  res.json({ question: rowToQuestion(row) });
});

module.exports = router;
