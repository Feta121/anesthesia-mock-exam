"use strict";

const express = require("express");
const { getDb, rowToQuestion } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

function pickQuestions(db, userId, opts) {
  const { pool = "all", subject, topic, source, count } = opts;
  const filters = ["eligible = 1"];
  const params = [];
  if (subject) {
    filters.push("subject = ?");
    params.push(subject);
  }
  if (topic) {
    filters.push("topic = ?");
    params.push(topic);
  }
  if (source) {
    filters.push("source_pdf = ?");
    params.push(source);
  }
  const where = filters.join(" AND ");

  let sql;
  let sqlParams;
  if (pool === "incorrect") {
    sql = `SELECT DISTINCT q.id FROM questions q
             JOIN attempt_answers aa ON aa.question_id = q.id
             JOIN attempts a ON a.id = aa.attempt_id
            WHERE a.user_id = ? AND aa.is_correct = 0 AND ${where}
            ORDER BY RANDOM() LIMIT ?`;
    sqlParams = [userId, ...params, count];
  } else if (pool === "bookmarked") {
    sql = `SELECT q.id FROM questions q
             JOIN bookmarks b ON b.question_id = q.id
            WHERE b.user_id = ? AND ${where}
            ORDER BY RANDOM() LIMIT ?`;
    sqlParams = [userId, ...params, count];
  } else if (pool === "unseen") {
    sql = `SELECT q.id FROM questions q
            WHERE ${where} AND q.id NOT IN (
              SELECT aa.question_id FROM attempt_answers aa
                JOIN attempts a ON a.id = aa.attempt_id
               WHERE a.user_id = ? AND aa.selected IS NOT NULL AND aa.selected != ''
            )
            ORDER BY RANDOM() LIMIT ?`;
    sqlParams = [...params, userId, count];
  } else {
    sql = `SELECT id FROM questions WHERE ${where} ORDER BY RANDOM() LIMIT ?`;
    sqlParams = [...params, count];
  }

  let ids = db.prepare(sql).all(...sqlParams).map((r) => r.id);
  // Fallback: if a special pool returned too few, top up with random eligible questions
  if (ids.length < count && (pool === "incorrect" || pool === "bookmarked" || pool === "unseen")) {
    const need = count - ids.length;
    const placeholders = ids.map(() => "?").join(",") || "''";
    const extra = db
      .prepare(
        `SELECT id FROM questions WHERE ${where} AND id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`
      )
      .all(...params, ...ids, need)
      .map((r) => r.id);
    ids = ids.concat(extra);
  }
  return ids;
}

router.post("/", (req, res) => {
  const db = getDb();
  const body = req.body || {};
  const mode = body.mode === "exam" ? "exam" : "practice";
  const pool = ["all", "incorrect", "bookmarked", "unseen"].includes(body.pool) ? body.pool : "all";
  const count = Math.min(200, Math.max(1, parseInt(body.count, 10) || (mode === "exam" ? 50 : 10)));
  const timeLimit = mode === "exam" ? Math.max(60, parseInt(body.timeLimit, 10) || count * 90) : null;

  const ids = pickQuestions(db, req.user.id, {
    pool,
    subject: body.subject || null,
    topic: body.topic || null,
    source: body.source || null,
    count,
  });

  if (ids.length === 0) {
    return res.status(400).json({ error: "No questions match the selected criteria." });
  }

  const startedAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO attempts (user_id, mode, subject, topic, source, total, answered, correct, score,
        time_limit, started_at, status)
       VALUES (?,?,?,?,?,?,0,0,0,?,?, 'active')`
    )
    .run(
      req.user.id,
      mode,
      body.subject || null,
      body.topic || null,
      body.source || null,
      ids.length,
      timeLimit,
      startedAt
    );
  const attemptId = info.lastInsertRowid;

  const insertAns = db.prepare(
    "INSERT INTO attempt_answers (attempt_id, question_id, selected, is_correct, flagged, position) VALUES (?,?,NULL,NULL,0,?)"
  );
  db.exec("BEGIN");
  try {
    ids.forEach((id, i) => insertAns.run(attemptId, id, i));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const questions = ids.map((id) => {
    const q = rowToQuestion(byId.get(id));
    const view = { id: q.id, question: q.question, options: q.options, subject: q.subject, topic: q.topic, source: q.source, sourceNumber: q.sourceNumber };
    if (mode === "practice") {
      // practice reveals answers only after each answer is submitted
      delete view.correctAnswer;
    }
    return view;
  });

  res.status(201).json({
    attempt: {
      id: attemptId,
      mode,
      pool,
      subject: body.subject || null,
      topic: body.topic || null,
      source: body.source || null,
      total: ids.length,
      timeLimit,
      startedAt,
      status: "active",
    },
    questions,
  });
});

function computeTotals(db, attemptId) {
  const rows = db.prepare("SELECT selected, is_correct FROM attempt_answers WHERE attempt_id = ?").all(attemptId);
  const answered = rows.filter((r) => r.selected != null && r.selected !== "").length;
  const correct = rows.filter((r) => r.is_correct === 1).length;
  const total = rows.length;
  const score = total ? Math.round((correct / total) * 1000) / 10 : 0;
  db.prepare("UPDATE attempts SET answered=?, correct=?, score=? WHERE id=?").run(answered, correct, score, attemptId);
  return { answered, correct, total, score };
}

router.post("/:id/answer", (req, res) => {
  const db = getDb();
  const attempt = db.prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (attempt.status !== "active") return res.status(409).json({ error: "Attempt already finished" });

  const { questionId, selected, flagged } = req.body || {};
  const qRow = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId);
  if (!qRow) return res.status(404).json({ error: "Question not found" });

  const sel = selected == null || selected === "" ? null : String(selected).toUpperCase();
  const isCorrect = sel && qRow.correct_answer ? (sel === qRow.correct_answer ? 1 : 0) : null;

  db.prepare(
    `UPDATE attempt_answers SET selected=?, is_correct=?, flagged=?, answered_at=?
      WHERE attempt_id=? AND question_id=?`
  ).run(sel, isCorrect, flagged ? 1 : 0, new Date().toISOString(), attempt.id, questionId);

  const totals = computeTotals(db, attempt.id);
  res.json({
    correct: isCorrect === 1,
    graded: isCorrect != null,
    correctAnswer: qRow.correct_answer || null,
    explanation: qRow.explanation || "",
    answerOrigin: qRow.answer_origin,
    totals,
  });
});

router.post("/:id/submit", (req, res) => {
  const db = getDb();
  const attempt = db.prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });

  const answers = Array.isArray((req.body || {}).answers) ? req.body.answers : [];
  const duration = parseInt((req.body || {}).duration, 10) || null;

  const qIds = db.prepare("SELECT question_id FROM attempt_answers WHERE attempt_id = ?").all(attempt.id).map((r) => r.question_id);
  const qRows = db.prepare(`SELECT * FROM questions WHERE id IN (${qIds.map(() => "?").join(",")})`).all(...qIds);
  const keyById = new Map(qRows.map((r) => [r.id, r.correct_answer]));

  db.exec("BEGIN");
  try {
    const upd = db.prepare(
      "UPDATE attempt_answers SET selected=?, is_correct=?, flagged=? WHERE attempt_id=? AND question_id=?"
    );
    for (const a of answers) {
      if (!qIds.includes(a.questionId)) continue;
      const sel = a.selected == null || a.selected === "" ? null : String(a.selected).toUpperCase();
      const correct = keyById.get(a.questionId);
      const isCorrect = sel && correct ? (sel === correct ? 1 : 0) : null;
      upd.run(sel, isCorrect, a.flagged ? 1 : 0, attempt.id, a.questionId);
    }
    const totals = computeTotals(db, attempt.id);
    db.prepare("UPDATE attempts SET status='finished', finished_at=?, duration=? WHERE id=?").run(
      new Date().toISOString(),
      duration,
      attempt.id
    );
    db.exec("COMMIT");
    res.json({ totals, attemptId: attempt.id });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});

router.post("/:id/finish", (req, res) => {
  const db = getDb();
  const attempt = db.prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  const duration = parseInt((req.body || {}).duration, 10) || null;
  const totals = computeTotals(db, attempt.id);
  db.prepare("UPDATE attempts SET status='finished', finished_at=?, duration=? WHERE id=?").run(
    new Date().toISOString(),
    duration,
    attempt.id
  );
  res.json({ totals, attemptId: attempt.id });
});

router.get("/", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT 200")
    .all(req.user.id);
  res.json({
    attempts: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      subject: r.subject,
      topic: r.topic,
      source: r.source,
      total: r.total,
      answered: r.answered,
      correct: r.correct,
      score: r.score,
      timeLimit: r.time_limit,
      duration: r.duration,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    })),
  });
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const attempt = db.prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });

  const rows = db
    .prepare("SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY position")
    .all(attempt.id);
  const qIds = rows.map((r) => r.question_id);
  const qRows = db.prepare(`SELECT * FROM questions WHERE id IN (${qIds.map(() => "?").join(",")})`).all(...qIds);
  const qById = new Map(qRows.map((r) => [r.id, r]));
  const revealAnswers = attempt.status === "finished";

  const items = rows.map((r) => {
    const q = rowToQuestion(qById.get(r.question_id));
    if (!q) return null;
    return {
      questionId: q.id,
      position: r.position,
      selected: r.selected,
      isCorrect: r.is_correct === 1,
      flagged: r.flagged === 1,
      question: q.question,
      options: q.options,
      subject: q.subject,
      topic: q.topic,
      source: q.source,
      sourceNumber: q.sourceNumber,
      correctAnswer: revealAnswers ? q.correctAnswer : undefined,
      explanation: revealAnswers ? q.explanation : undefined,
      answerOrigin: revealAnswers ? q.answerOrigin : undefined,
    };
  }).filter(Boolean);

  const bookmarkSet = new Set(
    db.prepare("SELECT question_id FROM bookmarks WHERE user_id = ?").all(req.user.id).map((r) => r.question_id)
  );

  res.json({
    attempt: {
      id: attempt.id,
      mode: attempt.mode,
      subject: attempt.subject,
      topic: attempt.topic,
      source: attempt.source,
      total: attempt.total,
      answered: attempt.answered,
      correct: attempt.correct,
      score: attempt.score,
      timeLimit: attempt.time_limit,
      duration: attempt.duration,
      status: attempt.status,
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      revealAnswers,
    },
    items: items.map((it) => ({ ...it, bookmarked: bookmarkSet.has(it.questionId) })),
  });
});

router.delete("/:id", (req, res) => {
  const db = getDb();
  const attempt = db.prepare("SELECT id FROM attempts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  db.prepare("DELETE FROM attempts WHERE id = ?").run(attempt.id);
  res.json({ ok: true });
});

module.exports = router;
