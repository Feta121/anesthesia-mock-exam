import { api } from "../api.js";
import { el, toast, fmtDate, fmtDuration, scoreTone, confirmDialog } from "../utils.js";
import { scoreRing } from "../components.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Activity" }),
        el("h1", { text: "Exam & practice history" }),
        el("p", { class: "lede", text: "Every session you complete is stored here for review." }),
      ]),
    ])
  );

  const host = el("div");
  root.appendChild(host);
  host.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;

  let attempts = [];
  try {
    ({ attempts } = await api.attempts());
  } catch (err) {
    toast(err.message, "err");
    return;
  }

  host.innerHTML = "";
  if (!attempts.length) {
    host.appendChild(
      el("div", { class: "empty" }, [
        el("div", { class: "big", text: "↺" }),
        el("div", { text: "No sessions yet." }),
        el("div", { class: "btn-row mt-2", style: "justify-content:center" }, [
          el("button", { class: "btn", onclick: () => ctx.navigate("#/exam") }, "Start a mock exam"),
        ]),
      ])
    );
    return;
  }

  const card = el("div", { class: "card" });
  for (const a of attempts) {
    const finished = a.status === "finished";
    const row = el("div", { class: "list-row" }, [
      finished ? scoreRing(a.score || 0) : el("div", { class: "score-ring", style: "--val:0" }, [el("span", { text: "…" })]),
      el("div", { class: "grow" }, [
        el("div", { class: "list-title" }, [
          a.mode === "exam" ? "Mock exam" : "Practice",
          a.subject ? ` · ${a.subject}` : "",
          a.topic ? ` · ${a.topic}` : "",
        ]),
        el("div", { class: "list-sub", text: `${a.correct}/${a.total} correct · ${a.answered} answered · ${fmtDate(a.finishedAt || a.startedAt)}${a.duration ? " · " + fmtDuration(a.duration) : ""}` }),
      ]),
      el("span", { class: `badge ${finished ? scoreTone(a.score || 0) : "amber"}`, text: finished ? `${Math.round(a.score || 0)}%` : "In progress" }),
      el("div", { class: "btn-row" }, [
        el("button", { class: "btn ghost sm", onclick: () => ctx.navigate(`#/review/${a.id}`) }, "Review"),
        el("button", { class: "btn ghost sm", onclick: async () => {
          const ok = await confirmDialog({ title: "Delete session?", message: "This will permanently remove this session and its answers.", confirmText: "Delete", danger: true });
          if (!ok) return;
          await api.deleteAttempt(a.id);
          row.remove();
          toast("Session deleted");
        } }, "Delete"),
      ]),
    ]);
    card.appendChild(row);
  }
  host.appendChild(card);
}
