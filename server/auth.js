"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SECRET_PATH = process.env.AMX_SECRET_FILE || path.join(DATA_DIR, "secret.key");

function getSecret() {
  if (process.env.AMX_SECRET) return process.env.AMX_SECRET;
  try {
    if (fs.existsSync(SECRET_PATH)) {
      const s = fs.readFileSync(SECRET_PATH, "utf8").trim();
      if (s) return s;
    }
  } catch {
    /* ignore */
  }
  const secret = crypto.randomBytes(48).toString("hex");
  try {
    fs.mkdirSync(path.dirname(SECRET_PATH), { recursive: true });
    fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
  } catch {
    /* ignore */
  }
  return secret;
}

const SECRET = getSecret();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(data) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

function createToken(userId) {
  const payload = { uid: userId, exp: Date.now() + TOKEN_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.uid !== "number" || payload.exp < Date.now()) return null;
  return payload;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const computed = crypto.scryptSync(String(password), salt, 64).toString("hex");
    const a = Buffer.from(computed);
    const b = Buffer.from(hash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, email: row.email, role: row.role, createdAt: row.created_at };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    req.user = null;
    return next();
  }
  const db = require("./db").getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.uid);
  req.user = row || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

module.exports = {
  createToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  publicUser,
  authenticate,
  requireAuth,
};
