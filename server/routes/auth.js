"use strict";

const express = require("express");
const auth = require("../auth");
const { getDb } = require("../db");

const router = express.Router();

router.post("/register", (req, res) => {
  const db = getDb();
  let { username, email, password } = req.body || {};
  username = String(username || "").trim();
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");

  if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Invalid email address" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const exists = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
  if (exists) return res.status(409).json({ error: "Username or email already registered" });

  const { salt, hash } = auth.hashPassword(password);
  const info = db
    .prepare("INSERT INTO users (username,email,password_hash,salt,role,created_at) VALUES (?,?,?,?,?,?)")
    .run(username, email, hash, salt, "student", new Date().toISOString());

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = auth.createToken(row.id);
  res.status(201).json({ token, user: auth.publicUser(row) });
});

router.post("/login", (req, res) => {
  const db = getDb();
  const login = String((req.body || {}).username || "").trim();
  const password = String((req.body || {}).password || "");
  const row = db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(login, login.toLowerCase());
  if (!row || !auth.verifyPassword(password, row.salt, row.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = auth.createToken(row.id);
  res.json({ token, user: auth.publicUser(row) });
});

router.get("/me", auth.requireAuth, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

router.post("/logout", auth.requireAuth, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
