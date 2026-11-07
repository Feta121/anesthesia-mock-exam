import { api } from "../api.js";
import { store } from "../store.js";
import { el, toast, confirmDialog } from "../utils.js";
import { metaBadges, renderOptions, explanationBlock, bookmarkButton } from "../components.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Saved" }),
        el("h1", { text: "Bookmarks" }),
        el("p", { class: "lede", text: "Questions you have saved for later review." }),
      ]),
      el("div", { class: "btn-row" }, [
        el("button", {
          class: "btn",
          onclick: () => {
            store.pendingSetup = { pool: "bookmarked", count: 20 };
            ctx.navigate("#/practice");
          },
        }, "Practice bookmarked"),
      ]),
    ])
  );

  const host = el("div");
  root.appendChild(host);
  host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  let questions = [];
  try {
    const res = await api.bookmarks();
    questions = res.questions;
  } catch (err) {
    toast(err.message, "err");
    return;
  }

  host.innerHTML = "";
  if (!questions.length) {
    host.appendChild(
      el("div", { class: "empty" }, [
        el("div", { class: "big", text: "☆" }),
        el("div", { text: "No bookmarks yet." }),
        el("p", { class: "muted small", text: "Tap the bookmark button on any question to save it here." }),
      ])
    );
    return;
  }

  host.appendChild(el("div", { class: "tiny muted mb-1", text: `${questions.length} bookmarked question${questions.length === 1 ? "" : "s"}` }));

  for (const q of questions) {
    const card = el("div", { class: "card mb-2" });
    card.appendChild(metaBadges(q));
    card.appendChild(el("div", { class: "q-stem", text: q.question }));
    const optsWrap = el("div", { class: "mt-2" });
    card.appendChild(optsWrap);

    let revealed = false;
    const renderOpts = () => renderOptions(optsWrap, q, { reveal: revealed, correctAnswer: q.correctAnswer, selected: revealed ? q.correctAnswer : null });
    renderOpts();

    const explainWrap = el("div");
    const toggle = el("button", { class: "btn ghost sm", onclick: () => {
      revealed = !revealed;
      toggle.textContent = revealed ? "Hide answer" : "Show answer";
      renderOpts();
      explainWrap.innerHTML = "";
      if (revealed) { const ex = explanationBlock(q); if (ex) explainWrap.appendChild(ex); }
    } }, "Show answer");

    const remove = el("button", { class: "btn danger sm", onclick: async () => {
      const ok = await confirmDialog({ title: "Remove bookmark?", message: "This question will be removed from your bookmarks.", confirmText: "Remove", danger: true });
      if (!ok) return;
      await api.removeBookmark(q.id);
      store.bookmarkIds.delete(q.id);
      card.remove();
      toast("Bookmark removed");
    } }, "Remove");

    card.append(el("div", { class: "btn-row mt-2" }, [toggle, remove]), explainWrap);
    host.appendChild(card);
  }
}
