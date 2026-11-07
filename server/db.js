"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.AMX_DB || path.join(DATA_DIR, "app.db");
const QUESTIONS_PATH = path.join(DATA_DIR, "questions.json");

let db;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seedQuestions(db);
  seedDemoUser(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      source_pdf TEXT NOT NULL,
      source_file_no INTEGER,
      source_number INTEGER,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      option_count INTEGER NOT NULL DEFAULT 0,
      correct_answer TEXT,
      explanation TEXT,
      explanation_origin TEXT,
      answer_origin TEXT,
      subject TEXT,
      topic TEXT,
      difficulty TEXT,
      verification_status TEXT,
      duplicate_status TEXT,
      duplicate_of TEXT,
      needs_manual_review INTEGER DEFAULT 0,
      flags TEXT,
      eligible INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_q_subject ON questions(subject);
    CREATE INDEX IF NOT EXISTS idx_q_topic ON questions(topic);
    CREATE INDEX IF NOT EXISTS idx_q_source ON questions(source_pdf);
    CREATE INDEX IF NOT EXISTS idx_q_eligible ON questions(eligible);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      subject TEXT,
      topic TEXT,
      source TEXT,
      total INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      time_limit INTEGER,
      duration INTEGER,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE INDEX IF NOT EXISTS idx_attempt_user ON attempts(user_id);

    CREATE TABLE IF NOT EXISTS attempt_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      selected TEXT,
      is_correct INTEGER,
      flagged INTEGER DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      answered_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_aa_attempt ON attempt_answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_aa_question ON attempt_answers(question_id);

    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function isEligible(q) {
  const opts = q.options || {};
  const n = Object.keys(opts).length;
  return (
    n >= 2 &&
    typeof q.correct_answer === "string" &&
    q.correct_answer.trim() !== "" &&
    Object.prototype.hasOwnProperty.call(opts, q.correct_answer)
  );
}

function seedQuestions(db) {
  const metaRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("questions_seeded");
  const countRow = db.prepare("SELECT COUNT(*) AS c FROM questions").get();
  if (countRow.c > 0 && metaRow) return;

  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.warn("[db] questions.json not found at", QUESTIONS_PATH);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  const questions = Array.isArray(raw) ? raw : raw.questions || [];

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM questions");
    const insert = db.prepare(`
      INSERT OR REPLACE INTO questions
      (id, source_pdf, source_file_no, source_number, question, options, option_count,
       correct_answer, explanation, explanation_origin, answer_origin, subject, topic,
       difficulty, verification_status, duplicate_status, duplicate_of, needs_manual_review, flags, eligible)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    let eligible = 0;
    for (const q of questions) {
      const opts = q.options || {};
      const optionCount = Object.keys(opts).length;
      const elig = isEligible(q) ? 1 : 0;
      if (elig) eligible++;
      insert.run(
        String(q.id),
        q.source_pdf || "unknown",
        q.source_file_no == null ? null : Number(q.source_file_no),
        q.source_question_number == null ? null : Number(q.source_question_number),
        q.question || "",
        JSON.stringify(opts),
        optionCount,
        q.correct_answer == null ? null : q.correct_answer,
        q.explanation == null ? null : q.explanation,
        q.explanation_origin == null ? null : q.explanation_origin,
        q.answer_origin == null ? null : q.answer_origin,
        q.subject == null ? null : q.subject,
        q.topic == null ? null : q.topic,
        q.difficulty == null ? null : q.difficulty,
        q.verification_status == null ? null : q.verification_status,
        q.duplicate_status == null ? null : q.duplicate_status,
        JSON.stringify(q.duplicate_of || []),
        q.needs_manual_review ? 1 : 0,
        JSON.stringify(q.flags || []),
        elig
      );
    }
    db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)").run(
      "questions_seeded",
      String(Date.now())
    );
    db.exec("COMMIT");
    console.log(
      `[db] seeded ${questions.length} questions (${eligible} exam-eligible) from questions.json`
    );
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function seedDemoUser(db) {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get();
  if (row.c > 0) return;
  const auth = require("./auth");
  const { salt, hash } = auth.hashPassword("demo1234");
  db.prepare(
    "INSERT INTO users (username,email,password_hash,salt,role,created_at) VALUES (?,?,?,?,?,?)"
  ).run("demo", "demo@anesthesia.local", hash, salt, "student", new Date().toISOString());
  console.log("[db] seeded demo user (demo / demo1234)");
}

function rowToQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source_pdf,
    sourceNumber: row.source_number,
    question: row.question,
    options: safeParse(row.options, {}),
    correctAnswer: row.correct_answer,
    explanation: row.explanation || "",
    explanationOrigin: row.explanation_origin,
    answerOrigin: row.answer_origin,
    subject: row.subject,
    topic: row.topic,
    difficulty: row.difficulty,
    verificationStatus: row.verification_status,
    duplicateStatus: row.duplicate_status,
    needsManualReview: !!row.needs_manual_review,
    flags: safeParse(row.flags, []),
    eligible: !!row.eligible,
  };
}

function safeParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = { getDb, DB_PATH, DATA_DIR, rowToQuestion, isEligible };
