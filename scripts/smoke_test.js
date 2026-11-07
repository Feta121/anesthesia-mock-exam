"use strict";

const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function raw(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  return { status: res.status, text };
}

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

async function main() {
  require("../server/index");
  await new Promise((r) => setTimeout(r, 1500));

  const health = await call("GET", "/api/health");
  assert(health.status === 200 && health.json.questions > 2000, `health (${health.json.questions} questions)`);

  const username = "tester_" + Date.now();
  const reg = await call("POST", "/api/auth/register", {
    username,
    email: `${username}@test.local`,
    password: "secret123",
  });
  assert(reg.status === 201 && reg.json.token, "register returns token");
  const token = reg.json.token;

  const badLogin = await call("POST", "/api/auth/login", { username, password: "wrong" });
  assert(badLogin.status === 401, "reject bad login");

  const login = await call("POST", "/api/auth/login", { username, password: "secret123" });
  assert(login.status === 200 && login.json.token, "login works");

  const me = await call("GET", "/api/auth/me", null, token);
  assert(me.status === 200 && me.json.user.username === username, "auth/me works");

  const summary = await call("GET", "/api/catalog/summary");
  assert(summary.status === 200 && summary.json.totalQuestions === 2992, `catalog summary total=${summary.json.totalQuestions}`);

  const subjects = await call("GET", "/api/catalog/subjects");
  assert(subjects.status === 200 && subjects.json.subjects.length > 10, `subjects count=${subjects.json.subjects.length}`);

  const search = await call("GET", "/api/catalog/questions?search=lidocaine&limit=5");
  assert(search.status === 200 && search.json.questions.length > 0, "search returns results");

  // Practice attempt
  const prac = await call("POST", "/api/attempts", { mode: "practice", count: 5, subject: "Pharmacology" }, token);
  assert(prac.status === 201 && prac.json.questions.length === 5, `practice start (${prac.json.questions.length})`);
  assert(prac.json.questions[0].correctAnswer === undefined, "practice hides answer until answered");
  const aId = prac.json.attempt.id;

  const q0 = prac.json.questions[0];
  const answer = await call("POST", `/api/attempts/${aId}/answer`, { questionId: q0.id, selected: Object.keys(q0.options)[0] }, token);
  assert(answer.status === 200 && typeof answer.json.correct === "boolean", "practice answer graded");
  assert(typeof answer.json.correctAnswer === "string", "practice answer reveals key");

  const finish = await call("POST", `/api/attempts/${aId}/finish`, { duration: 120 }, token);
  assert(finish.status === 200 && finish.json.totals.total === 5, `practice finish totals=${JSON.stringify(finish.json.totals)}`);

  // Exam attempt
  const exam = await call("POST", "/api/attempts", { mode: "exam", count: 10, timeLimit: 900 }, token);
  assert(exam.status === 201 && exam.json.attempt.timeLimit === 900, "exam start with time limit");
  const eId = exam.json.attempt.id;
  const answers = exam.json.questions.map((q, i) => ({ questionId: q.id, selected: Object.keys(q.options)[i % Object.keys(q.options).length], flagged: i === 0 }));
  const submit = await call("POST", `/api/attempts/${eId}/submit`, { answers, duration: 300 }, token);
  assert(submit.status === 200 && submit.json.totals.total === 10, "exam submit");

  const review = await call("GET", `/api/attempts/${eId}`, null, token);
  assert(review.status === 200 && review.json.attempt.revealAnswers === true, "exam review reveals answers");
  assert(review.json.items[0].correctAnswer !== undefined, "review has correct answer");

  const history = await call("GET", "/api/attempts", null, token);
  assert(history.status === 200 && history.json.attempts.length >= 2, `history count=${history.json.attempts.length}`);

  // Bookmarks
  const bm = await call("POST", `/api/bookmarks/${q0.id}`, null, token);
  assert(bm.status === 200 && bm.json.bookmarked, "bookmark add");
  const bms = await call("GET", "/api/bookmarks", null, token);
  assert(bms.status === 200 && bms.json.questions.length === 1, "bookmark list");

  // Stats
  const overview = await call("GET", "/api/stats/overview", null, token);
  assert(overview.status === 200 && overview.json.questionsAnswered > 0, `stats overview answered=${overview.json.questionsAnswered}`);
  const subjStats = await call("GET", "/api/stats/subjects", null, token);
  assert(subjStats.status === 200 && Array.isArray(subjStats.json.subjects), "stats subjects");
  const incorrect = await call("GET", "/api/stats/incorrect", null, token);
  assert(incorrect.status === 200 && typeof incorrect.json.count === "number", `stats incorrect count=${incorrect.json.count}`);

  // Unauthorized
  const unauth = await call("GET", "/api/bookmarks");
  assert(unauth.status === 401, "unauthorized blocked");

  // Static frontend + SPA fallback
  const home = await raw("/");
  assert(home.status === 200 && /Anesthesia Mock Exam/i.test(home.text), "serves index.html");
  const css = await raw("/css/styles.css");
  assert(css.status === 200 && css.text.includes("--brand-700"), "serves stylesheet");
  const appJs = await raw("/js/app.js");
  assert(appJs.status === 200 && appJs.text.includes("VIEWS"), "serves app module");
  const spa = await raw("/history/123");
  assert(spa.status === 200 && /<div id="app"/.test(spa.text), "SPA fallback returns index.html");

  // Catalog shape used by the frontend
  const subj = subjects.json.subjects[0];
  assert(Array.isArray(subj.topics) && subj.topics[0].topic != null && subj.eligible != null, "subject shape has topics + eligible");

  // Pool-based attempts
  const inc = await call("POST", "/api/attempts", { mode: "practice", pool: "incorrect", count: 3 }, token);
  assert(inc.status === 201 && inc.json.questions.length > 0, `incorrect pool attempt (${inc.json.questions.length})`);
  const bmPool = await call("POST", "/api/attempts", { mode: "practice", pool: "bookmarked", count: 3 }, token);
  assert(bmPool.status === 201 && bmPool.json.questions.length > 0, "bookmarked pool attempt");
  const unseen = await call("POST", "/api/attempts", { mode: "practice", pool: "unseen", count: 5 }, token);
  assert(unseen.status === 201 && unseen.json.questions.length === 5, "unseen pool attempt");

  // Demo account
  const demo = await call("POST", "/api/auth/login", { username: "demo", password: "demo1234" });
  assert(demo.status === 200 && demo.json.user.username === "demo", "demo account login");

  console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
  process.exit(process.exitCode || 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
