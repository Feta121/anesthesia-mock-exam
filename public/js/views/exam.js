import { api } from "../api.js";
import { el, toast, fmtClock, confirmDialog } from "../utils.js";
import { metaBadges, renderOptions } from "../components.js";
import { setupPanel } from "./session-setup.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Examination" }),
        el("h1", { text: "Mock examination" }),
        el("p", { class: "lede", text: "A randomized, timed exam that mirrors the real testing environment. Answers are revealed after submission." }),
      ]),
    ])
  );

  const host = el("div");
  root.appendChild(host);

  const start = async (config) => {
    try {
      host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
      const res = await api.startAttempt(config);
      runExam(host, ctx, res);
    } catch (err) {
      toast(err.message, "err");
      mountSetup();
    }
  };
  function mountSetup() {
    host.innerHTML = "";
    host.appendChild(setupPanel("exam", start));
  }
  mountSetup();
}

function runExam(host, ctx, session) {
  const { attempt, questions } = session;
  let index = 0;
  const answers = {};
  const flagged = new Set();
  const total = questions.length;
  let remaining = attempt.timeLimit || total * 90;
  const startTime = Date.now();
  let submitted = false;

  host.innerHTML = "";

  const timerEl = el("div", { class: "timer" });
  const progressBar = el("div", { class: "progress-bar", style: "width:0%" });
  const body = el("div");
  const palette = el("div", { class: "navigator" });

  const top = el("div", { class: "quiz-top" }, [
    el("div", { class: "quiz-count" }, `Mock exam · ${total} questions`),
    el("div", { class: "btn-row" }, [
      timerEl,
      el("button", { class: "btn accent sm", onclick: () => confirmSubmit() }, "Submit exam"),
    ]),
  ]);

  const layout = el("div", { class: "grid cols-2", style: "align-items:start" });
  const questionCol = el("div");
  const sideCol = el("div", { class: "card", style: "position:sticky;top:16px" }, [
    el("div", { class: "tiny muted mb-1", text: "Question navigator" }),
    palette,
    el("div", { class: "mt-2 small muted", id: "nav-legend" }),
    el("div", { class: "mt-2" }, [el("button", { class: "btn block", onclick: () => confirmSubmit() }, "Submit exam")]),
  ]);
  layout.append(questionCol, sideCol);

  host.append(
    top,
    el("div", { class: "progress-track mb-2" }, [progressBar]),
    layout,
    body
  );

  const timer = setInterval(tick, 1000);
  updateTimer();

  function tick() {
    if (submitted) return;
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      updateTimer();
      clearInterval(timer);
      toast("Time is up — submitting your exam.", "err");
      doSubmit();
      return;
    }
    updateTimer();
  }

  function updateTimer() {
    timerEl.textContent = fmtClock(remaining);
    timerEl.classList.toggle("warn", remaining < 300 && remaining >= 60);
    timerEl.classList.toggle("danger", remaining < 60);
  }

  function renderQuestion() {
    const q = questions[index];
    progressBar.style.width = `${((index + 1) / total) * 100}%`;
    questionCol.innerHTML = "";

    const card = el("div", { class: "card" });
    card.appendChild(metaBadges(q));
    card.appendChild(el("div", { class: "q-stem", text: q.question }));

    const optsWrap = el("div", { class: "mt-2" });
    renderOptions(optsWrap, q, {
      selected: answers[q.id],
      onPick: (key) => {
        answers[q.id] = key;
        renderQuestion();
        renderPalette();
      },
    });
    card.appendChild(optsWrap);

    const actions = el("div", { class: "btn-row mt-2" }, [
      el("button", { class: "btn ghost sm", onclick: () => { index = Math.max(0, index - 1); renderQuestion(); }, disabled: index === 0 }, "← Previous"),
      el("button", { class: "btn ghost sm", onclick: toggleFlag }, flagged.has(q.id) ? "★ Unflag" : "☆ Flag for review"),
      index < total - 1
        ? el("button", { class: "btn sm", onclick: () => { index += 1; renderQuestion(); } }, "Next →")
        : el("button", { class: "btn accent sm", onclick: () => confirmSubmit() }, "Review & submit"),
    ]);
    card.appendChild(actions);
    questionCol.appendChild(card);
    questionCol.appendChild(
      el("div", { class: "tiny muted mt-1", text: `Question ${index + 1} of ${total}` })
    );
  }

  function toggleFlag() {
    const q = questions[index];
    if (flagged.has(q.id)) flagged.delete(q.id);
    else flagged.add(q.id);
    renderPalette();
    renderQuestion();
  }

  function renderPalette() {
    palette.innerHTML = "";
    questions.forEach((q, i) => {
      const cls = ["nav-cell"];
      if (i === index) cls.push("current");
      if (answers[q.id]) cls.push("answered");
      if (flagged.has(q.id)) cls.push("flagged");
      palette.appendChild(
        el("button", { class: cls.join(" "), text: String(i + 1), title: flagged.has(q.id) ? "Flagged" : "", onclick: () => { index = i; renderQuestion(); renderPalette(); } })
      );
    });
    const answered = Object.keys(answers).length;
    document.getElementById("nav-legend").innerHTML =
      `<strong>${answered}</strong> answered · <strong>${total - answered}</strong> remaining · <strong>${flagged.size}</strong> flagged`;
  }

  async function confirmSubmit() {
    const answered = Object.keys(answers).length;
    if (answered < total) {
      const ok = await confirmDialog({
        title: "Submit exam?",
        message: `You have answered ${answered} of ${total}. Unanswered questions will be marked incorrect. You cannot change answers after submitting.`,
        confirmText: "Submit exam",
        danger: true,
      });
      if (!ok) return;
    }
    doSubmit();
  }

  async function doSubmit() {
    if (submitted) return;
    submitted = true;
    clearInterval(timer);
    const duration = Math.round((Date.now() - startTime) / 1000);
    try {
      const payload = {
        duration,
        answers: questions.map((q) => ({ questionId: q.id, selected: answers[q.id] || null, flagged: flagged.has(q.id) })),
      };
      const res = await api.submit(attempt.id, payload);
      showResults(host, ctx, res.totals, attempt, duration);
    } catch (err) {
      submitted = false;
      toast(err.message, "err");
    }
  }

  renderPalette();
  renderQuestion();
  updateTimer();
}

function showResults(host, ctx, totals, attempt, duration) {
  host.innerHTML = "";
  const tone = totals.score >= 75 ? "green" : totals.score >= 55 ? "amber" : "red";
  const card = el("div", { class: "card" }, [
    el("div", { class: "eyebrow", text: "Exam submitted" }),
    el("h1", { text: `${totals.score}%` }),
    el("span", { class: `badge ${tone}`, text: totals.score >= 55 ? "Passing range" : "Needs improvement" }),
    el("p", { class: "muted mt-2", text: `${totals.correct} correct out of ${totals.total} questions in ${fmtClock(duration)}.` }),
    el("div", { class: "grid cols-3 mt-2" }, [
      miniStat(totals.correct, "Correct", "green"),
      miniStat(totals.total - totals.correct, "Incorrect", "red"),
      miniStat(totals.total, "Total", ""),
    ]),
    el("div", { class: "btn-row mt-3" }, [
      el("button", { class: "btn", onclick: () => ctx.navigate(`#/review/${attempt.id}`) }, "Review all answers"),
      el("button", { class: "btn ghost", onclick: () => ctx.navigate("#/exam") }, "New exam"),
      el("button", { class: "btn ghost", onclick: () => ctx.navigate("#/analytics") }, "View analytics"),
    ]),
  ]);
  host.appendChild(card);
}

function miniStat(value, label, tone) {
  return el("div", { class: "card pad-sm center" }, [
    el("div", { class: `stat-value ${tone}`, style: "font-size:1.5rem", text: String(value) }),
    el("div", { class: "tiny muted", text: label }),
  ]);
}
