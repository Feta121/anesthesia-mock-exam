"use strict";

const express = require("express");
const { getDb } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

router.get("/overview", (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const attempts = db
    .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(duration),0) AS dur, COALESCE(AVG(score),0) AS avg, COALESCE(MAX(score),0) AS best FROM attempts WHERE user_id = ? AND status='finished'")
    .get(uid);

  const answered = db
    .prepare(
      `SELECT COUNT(*) AS c, SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct
         FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
        WHERE a.user_id = ? AND aa.selected IS NOT NULL AND aa.selected != ''`
    )
    .get(uid);

  const distinctAnswered = db
    .prepare(
      `SELECT COUNT(DISTINCT aa.question_id) AS c
         FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
        WHERE a.user_id = ? AND aa.selected IS NOT NULL AND aa.selected != ''`
    )
    .get(uid);

  const bookmarks = db.prepare("SELECT COUNT(*) AS c FROM bookmarks WHERE user_id = ?").get(uid);
  const incorrectDistinct = db
    .prepare(
      `SELECT COUNT(DISTINCT aa.question_id) AS c
         FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
        WHERE a.user_id = ? AND aa.is_correct = 0`
    )
    .get(uid);

  const totalBank = db.prepare("SELECT COUNT(*) AS c FROM questions WHERE eligible=1").get();

  const accuracy = answered.c ? Math.round((answered.correct / answered.c) * 1000) / 10 : 0;

  res.json({
    finishedAttempts: attempts.c,
    totalStudySeconds: attempts.dur,
    averageScore: Math.round(attempts.avg * 10) / 10,
    bestScore: Math.round(attempts.best * 10) / 10,
    questionsAnswered: answered.c,
    distinctAnswered: distinctAnswered.c,
    overallAccuracy: accuracy,
    correctCount: answered.correct,
    bookmarks: bookmarks.c,
    incorrectDistinct: incorrectDistinct.c,
    bankSize: totalBank.c,
  });
});

router.get("/subjects", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.subject AS subject,
              COUNT(*) AS answered,
              SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id
         JOIN questions q ON q.id = aa.question_id
        WHERE a.user_id = ? AND aa.selected IS NOT NULL AND aa.selected != '' AND q.subject IS NOT NULL
        GROUP BY q.subject`
    )
    .all(req.user.id);

  const subjects = rows
    .map((r) => ({
      subject: r.subject,
      answered: r.answered,
      correct: r.correct,
      accuracy: r.answered ? Math.round((r.correct / r.answered) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  res.json({ subjects });
});

router.get("/topics", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.topic AS topic, q.subject AS subject,
              COUNT(*) AS answered,
              SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id
         JOIN questions q ON q.id = aa.question_id
        WHERE a.user_id = ? AND aa.selected IS NOT NULL AND aa.selected != '' AND q.topic IS NOT NULL
        GROUP BY q.topic, q.subject
        HAVING answered >= 1
        ORDER BY (CAST(SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS REAL)/COUNT(*)) ASC
        LIMIT 40`
    )
    .all(req.user.id);
  res.json({
    topics: rows.map((r) => ({
      topic: r.topic,
      subject: r.subject,
      answered: r.answered,
      correct: r.correct,
      accuracy: r.answered ? Math.round((r.correct / r.answered) * 1000) / 10 : 0,
    })),
  });
});

router.get("/timeline", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, mode, score, correct, total, finished_at AS finishedAt
         FROM attempts WHERE user_id = ? AND status='finished'
        ORDER BY finished_at ASC LIMIT 100`
    )
    .all(req.user.id);
  res.json({ timeline: rows });
});

router.get("/incorrect", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT q.id, q.subject, q.topic, q.question
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id
         JOIN questions q ON q.id = aa.question_id
        WHERE a.user_id = ? AND aa.is_correct = 0 AND q.eligible = 1`
    )
    .all(req.user.id);
  res.json({ count: rows.length, questions: rows });
});

module.exports = router;
