import { el, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { store } from "./store.js";

export function metaBadges(q) {
  const badges = [];
  if (q.subject) badges.push(el("span", { class: "badge brand", text: q.subject }));
  if (q.topic && q.topic !== q.subject) badges.push(el("span", { class: "badge", text: q.topic }));
  if (q.source) badges.push(el("span", { class: "badge", text: q.source }));
  if (q.sourceNumber != null) badges.push(el("span", { class: "badge", text: "Q" + q.sourceNumber }));
  return el("div", { class: "q-meta" }, badges);
}

export function questionCard(q, opts = {}) {
  const card = el("div", { class: "card" });
  card.appendChild(metaBadges(q));
  if (opts.positionLabel) {
    card.appendChild(el("div", { class: "tiny muted mb-1", text: opts.positionLabel }));
  }
  card.appendChild(el("div", { class: "q-stem", text: q.question }));
  const optsWrap = el("div", { class: "mt-2" });
  card.appendChild(optsWrap);
  renderOptions(optsWrap, q, opts);
  return card;
}

export function renderOptions(host, q, opts = {}) {
  const { selected, correctAnswer, reveal = false, disabled = false, onPick } = opts;
  host.innerHTML = "";
  const keys = Object.keys(q.options || {});
  for (const key of keys) {
    const isSel = selected === key;
    const isCorrect = reveal && correctAnswer === key;
    const isWrongSel = reveal && isSel && correctAnswer && key !== correctAnswer;
    const classes = ["option"];
    if (reveal) classes.push("disabled");
    if (isSel) classes.push("selected");
    if (isCorrect) classes.push("correct");
    if (isWrongSel) classes.push("wrong");
    if (disabled) classes.push("disabled");

    const node = el("div", { class: classes.join(" ") }, [
      el("div", { class: "key", text: key }),
      el("div", { class: "txt", text: q.options[key] }),
    ]);
    if (!disabled && onPick && !reveal) {
      node.onclick = () => onPick(key);
    }
    host.appendChild(node);
  }
}

export function explanationBlock(q) {
  if (!q.explanation && !q.correctAnswer) return null;
  const box = el("div", { class: "explanation" });
  box.appendChild(el("h4", { text: "Explanation" }));
  if (q.explanation) {
    box.appendChild(el("div", { style: "white-space:pre-wrap", text: q.explanation }));
  } else {
    box.appendChild(el("div", { class: "muted", text: "No explanation available for this question." }));
  }
  if (q.answerOrigin === "source") {
    box.appendChild(el("div", { class: "src", text: "Answer verified from source material." }));
  }
  return box;
}

export function bookmarkButton(questionId, onChange) {
  const btn = el("button", { class: "btn ghost sm" });
  const sync = () => {
    const on = store.bookmarkIds.has(questionId);
    btn.innerHTML = `${on ? "★" : "☆"} <span>${on ? "Bookmarked" : "Bookmark"}</span>`;
  };
  sync();
  btn.onclick = async () => {
    try {
      if (store.bookmarkIds.has(questionId)) {
        await api.removeBookmark(questionId);
        store.bookmarkIds.delete(questionId);
        toast("Removed from bookmarks");
      } else {
        await api.addBookmark(questionId);
        store.bookmarkIds.add(questionId);
        toast("Added to bookmarks", "ok");
      }
      sync();
      if (onChange) onChange(store.bookmarkIds.has(questionId));
    } catch (err) {
      toast(err.message, "err");
    }
  };
  return btn;
}

export function scoreRing(score) {
  return el("div", { class: "score-ring", style: `--val:${score}` }, [el("span", { text: `${Math.round(score)}%` })]);
}
