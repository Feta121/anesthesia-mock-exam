"use strict";

const express = require("express");
const { getDb, rowToQuestion } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.*, b.created_at AS bookmarked_at
         FROM bookmarks b JOIN questions q ON q.id = b.question_id
        WHERE b.user_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.json({ questions: rows.map(rowToQuestion) });
});

router.post("/:id", (req, res) => {
  const db = getDb();
  const q = db.prepare("SELECT id FROM questions WHERE id = ?").get(req.params.id);
  if (!q) return res.status(404).json({ error: "Question not found" });
  db.prepare("INSERT OR IGNORE INTO bookmarks (user_id, question_id, created_at) VALUES (?,?,?)").run(
    req.user.id,
    req.params.id,
    new Date().toISOString()
  );
  res.json({ bookmarked: true });
});

router.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?").run(req.user.id, req.params.id);
  res.json({ bookmarked: false });
});

module.exports = router;
