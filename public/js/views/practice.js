import { api } from "../api.js";
import { el, toast, pct, confirmDialog } from "../utils.js";
import { renderOptions, explanationBlock, metaBadges, bookmarkButton } from "../components.js";
import { setupPanel } from "./session-setup.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Practice mode" }),
        el("h1", { text: "Focused practice" }),
        el("p", { class: "lede", text: "Answer at your own pace with instant feedback and explanations." }),
      ]),
    ])
  );

  const host = el("div");
  root.appendChild(host);

  const start = async (config) => {
    try {
      host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
      const res = await api.startAttempt(config);
      runPractice(host, ctx, res);
    } catch (err) {
      toast(err.message, "err");
      host.innerHTML = "";
      host.appendChild(setupPanel("practice", start));
    }
  };

  host.appendChild(setupPanel("practice", start));
}

function runPractice(host, ctx, session) {
  const { attempt, questions } = session;
  const state = {
    index: 0,
    answers: {}, // qid -> selected
    feedback: {}, // qid -> {correct, correctAnswer, explanation}
  };

  const quizHost = el("div");
  host.innerHTML = "";
  host.appendChild(quizHost);

  function answeredCount() {
    return Object.keys(state.answers).length;
  }

  function renderCurrent() {
    quizHost.innerHTML = "";
    const q = questions[state.index];
    const total = questions.length;

    const top = el("div", { class: "quiz-top" }, [
      el("div", { class: "quiz-count", text: `Question ${state.index + 1} of ${total}` }),
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn ghost sm", onclick: () => go(-1), disabled: state.index === 0 }, "← Previous"),
        state.index < total - 1
          ? el("button", { class: "btn sm", onclick: () => go(1) }, "Next →")
          : el("button", { class: "btn accent sm", onclick: finish }, "Finish session"),
      ]),
    ]);

    const progress = el("div", { class: "progress-track mb-2" }, [
      el("div", { class: "progress-bar", style: `width:${pct(answeredCount(), total)}%` }),
    ]);

    const card = el("div", { class: "card" });
    card.appendChild(metaBadges(q));
    card.appendChild(el("div", { class: "q-stem", text: q.question }));

    const optsWrap = el("div", { class: "mt-2" });
    card.appendChild(optsWrap);

    const fb = state.feedback[q.id];
    const selected = state.answers[q.id];

    const doPick = async (key) => {
      if (state.feedback[q.id]) return;
      state.answers[q.id] = key;
      renderOptions(optsWrap, q, { selected: key, disabled: true });
      try {
        const res = await api.answer(attempt.id, { questionId: q.id, selected: key });
        state.feedback[q.id] = res;
        renderCurrent();
      } catch (err) {
        toast(err.message, "err");
      }
    };

    renderOptions(optsWrap, q, {
      selected,
      correctAnswer: fb?.correctAnswer,
      reveal: !!fb,
      disabled: !!fb,
      onPick: doPick,
    });

    if (fb) {
      const row = el("div", { class: "mt-2", style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap" }, [
        el("span", { class: `feedback ${fb.correct ? "ok" : "no"}`, text: fb.correct ? "✓ Correct" : `✕ Incorrect` }),
        fb.graded === false ? el("span", { class: "badge amber", text: "No source answer key" }) : null,
        el("div", { style: "flex:1" }),
        bookmarkButton(q.id),
      ]);
      card.appendChild(row);
      const ex = explanationBlock({ ...q, correctAnswer: fb.correctAnswer, explanation: fb.explanation, answerOrigin: fb.answerOrigin });
      if (ex) card.appendChild(ex);
    } else {
      card.appendChild(el("div", { class: "mt-2" }, [bookmarkButton(q.id)]));
    }

    quizHost.append(top, progress, card);

    // navigator
    const nav = el("div", { class: "card mt-2" }, [
      el("div", { class: "tiny muted mb-1", text: "Jump to question" }),
      el("div", { class: "navigator" }, questions.map((qq, i) => {
        const f = state.feedback[qq.id];
        const cls = ["nav-cell"];
        if (i === state.index) cls.push("current");
        if (f) cls.push(f.correct ? "correct" : "wrong");
        else if (state.answers[qq.id]) cls.push("answered");
        return el("button", { class: cls.join(" "), text: String(i + 1), onclick: () => { state.index = i; renderCurrent(); } });
      })),
    ]);
    quizHost.appendChild(nav);

    quizHost.appendChild(
      el("div", { class: "btn-row mt-3" }, [
        el("button", { class: "btn accent", onclick: finish }, "Finish & see results"),
        el("button", { class: "btn ghost", onclick: restart }, "New session"),
      ])
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function go(delta) {
    state.index = Math.min(questions.length - 1, Math.max(0, state.index + delta));
    renderCurrent();
  }

  async function restart() {
    host.innerHTML = "";
    host.appendChild(setupPanel("practice", async (config) => {
      host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
      const res = await api.startAttempt(config);
      runPractice(host, ctx, res);
    }));
  }

  async function finish() {
    const answered = answeredCount();
    if (answered < questions.length) {
      const ok = await confirmDialog({
        title: "Finish session?",
        message: `You have answered ${answered} of ${questions.length} questions. Unanswered questions will be marked incorrect.`,
        confirmText: "Finish",
      });
      if (!ok) return;
    }
    try {
      const res = await api.finish(attempt.id, { duration: null });
      showSummary(host, ctx, res.totals, attempt, resetToSetup);
    } catch (err) {
      toast(err.message, "err");
    }
  }

  function resetToSetup() {
    host.innerHTML = "";
    host.appendChild(setupPanel("practice", async (config) => {
      host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
      const res = await api.startAttempt(config);
      runPractice(host, ctx, res);
    }));
  }

  renderCurrent();
}

function showSummary(host, ctx, totals, attempt, onRestart) {
  host.innerHTML = "";
  const card = el("div", { class: "card" }, [
    el("div", { class: "eyebrow", text: "Session complete" }),
    el("h1", { text: `${totals.score}%` }),
    el("p", { class: "muted", text: `${totals.correct} of ${totals.total} correct · ${totals.answered} answered` }),
    el("div", { class: "progress-track mt-2" }, [el("div", { class: "progress-bar", style: `width:${totals.score}%` })]),
    el("div", { class: "btn-row mt-3" }, [
      el("button", { class: "btn", onclick: () => ctx.navigate(`#/review/${attempt.id}`) }, "Review answers"),
      el("button", { class: "btn ghost", onclick: onRestart }, "Practice again"),
    ]),
  ]);
  host.appendChild(card);
}
