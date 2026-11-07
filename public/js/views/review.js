import { api } from "../api.js";
import { el, toast, fmtClock, fmtDate } from "../utils.js";
import { metaBadges, renderOptions, explanationBlock, bookmarkButton } from "../components.js";

export async function render(root, ctx) {
  const id = ctx.params[0];
  root.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  let data;
  try {
    data = await api.attempt(id);
  } catch (err) {
    root.innerHTML = "";
    root.appendChild(el("div", { class: "card" }, [el("h3", { text: "Not found" }), el("p", { class: "muted", text: err.message })]));
    return;
  }

  const { attempt, items } = data;
  root.innerHTML = "";

  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Review" }),
        el("h1", { text: `${attempt.mode === "exam" ? "Mock exam" : "Practice"} review` }),
        el("p", { class: "lede", text: `${fmtDate(attempt.finishedAt || attempt.startedAt)}${attempt.duration ? " · " + fmtClock(attempt.duration) : ""}${attempt.subject ? " · " + attempt.subject : ""}` }),
      ]),
      el("button", { class: "btn ghost", onclick: () => ctx.navigate("#/history") }, "← History"),
    ])
  );

  const summary = el("div", { class: "grid cols-4 mb-2" }, [
    summaryStat(`${attempt.score || 0}%`, "Score"),
    summaryStat(String(attempt.correct), "Correct"),
    summaryStat(String(attempt.total - attempt.correct), "Incorrect"),
    summaryStat(String(attempt.total), "Total"),
  ]);
  root.appendChild(summary);

  const filter = el("div", { class: "seg mb-2" });
  const filters = [
    ["all", `All (${items.length})`],
    ["incorrect", `Incorrect (${items.filter((i) => !i.isCorrect).length})`],
    ["flagged", `Flagged (${items.filter((i) => i.flagged).length})`],
  ];
  let active = "all";
  const listHost = el("div");
  const btns = {};
  for (const [val, label] of filters) {
    const b = el("button", { text: label, class: val === "all" ? "active" : "" });
    b.onclick = () => {
      active = val;
      Object.values(btns).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderList();
    };
    btns[val] = b;
    filter.appendChild(b);
  }
  root.appendChild(filter);
  root.appendChild(listHost);

  function renderList() {
    listHost.innerHTML = "";
    let list = items;
    if (active === "incorrect") list = items.filter((i) => !i.isCorrect);
    if (active === "flagged") list = items.filter((i) => i.flagged);
    if (!list.length) {
      listHost.appendChild(el("div", { class: "empty", text: "Nothing here." }));
      return;
    }
    for (const item of list) {
      listHost.appendChild(reviewItem(item));
    }
  }

  function reviewItem(item) {
    const q = {
      id: item.questionId,
      question: item.question,
      options: item.options,
      subject: item.subject,
      topic: item.topic,
      source: item.source,
      sourceNumber: item.sourceNumber,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      answerOrigin: item.answerOrigin,
    };
    const card = el("div", { class: "card mb-2" });
    const head = el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap" }, [
      el("div", { style: "display:flex;gap:6px;align-items:center" }, [
        el("span", { class: "badge", text: `#${item.position + 1}` }),
        el("span", { class: `feedback ${item.isCorrect ? "ok" : "no"}`, text: item.isCorrect ? "✓ Correct" : "✕ Incorrect" }),
        item.flagged ? el("span", { class: "badge amber", text: "Flagged" }) : null,
        !item.selected ? el("span", { class: "badge", text: "Unanswered" }) : null,
      ]),
      bookmarkButton(item.questionId),
    ]);
    card.appendChild(head);
    card.appendChild(el("div", { class: "mt-1" }, [metaBadges(q)]));
    card.appendChild(el("div", { class: "q-stem", text: item.question }));
    const optsWrap = el("div", { class: "mt-2" });
    renderOptions(optsWrap, q, { reveal: attempt.revealAnswers, correctAnswer: item.correctAnswer, selected: item.selected });
    card.appendChild(optsWrap);
    if (attempt.revealAnswers) {
      const ex = explanationBlock(q);
      if (ex) card.appendChild(ex);
    }
    return card;
  }

  renderList();
}

function summaryStat(value, label) {
  return el("div", { class: "card pad-sm center" }, [
    el("div", { style: "font-size:1.5rem;font-weight:800", text: value }),
    el("div", { class: "tiny muted", text: label }),
  ]);
}
