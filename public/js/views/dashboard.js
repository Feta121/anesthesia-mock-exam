import { api } from "../api.js";
import { store } from "../store.js";
import { el, fmtDuration, fmtDate, scoreTone } from "../utils.js";
import { scoreRing } from "../components.js";

export async function render(root, ctx) {
  const [overview, timeline, subjStats] = await Promise.all([
    api.overview(),
    api.timeline(),
    api.statsSubjects(),
  ]);

  const summary = store.summary || {};
  const s = store.user?.username || "there";

  const head = el("div", { class: "page-head" }, [
    el("div", {}, [
      el("div", { class: "eyebrow", text: "Dashboard" }),
      el("h1", { text: `Welcome back, ${s}` }),
      el("p", { class: "lede", text: "Your preparation at a glance. Keep the momentum going." }),
    ]),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn", onclick: () => ctx.navigate("#/exam") }, "Start mock exam"),
      el("button", { class: "btn ghost", onclick: () => ctx.navigate("#/practice") }, "Quick practice"),
    ]),
  ]);
  root.appendChild(head);

  const stats = el("div", { class: "grid cols-4" });
  stats.append(
    statTile("◔", `${overview.overallAccuracy}%`, "Overall accuracy", `${overview.correctCount}/${overview.questionsAnswered} correct`),
    statTile("✎", overview.finishedAttempts, "Sessions completed", `${overview.questionsAnswered} questions answered`),
    statTile("★", overview.bookmarks, "Bookmarked", `${overview.incorrectDistinct} to review`),
    statTile("◷", fmtDuration(overview.totalStudySeconds), "Time studied", `${summary.totalQuestions || 0} questions in bank`)
  );
  root.appendChild(stats);

  const cols = el("div", { class: "grid cols-2 mt-3" });

  // Quick actions
  const actions = el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [el("h3", { text: "Jump back in" })]),
    actionRow("Timed mock exam", "Simulate the real thing with a countdown.", "Start exam", () => ctx.navigate("#/exam")),
    actionRow("Practice by subject", "Target one subject with instant feedback.", "Choose subject", () => ctx.navigate("#/practice")),
    actionRow("Review mistakes", `Practice the ${overview.incorrectDistinct} questions you got wrong.`, "Practice mistakes", () => {
      store.pendingSetup = { pool: "incorrect" };
      ctx.navigate("#/practice");
    }),
    actionRow("Bookmarks", `${overview.bookmarks} saved questions.`, "Open", () => ctx.navigate("#/bookmarks")),
  ]);
  cols.appendChild(actions);

  // Weak subjects
  const weak = subjStats.subjects.filter((x) => x.answered >= 3).slice(0, 5);
  const weakCard = el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [
      el("h3", { text: "Weakest subjects" }),
      el("button", { class: "link-btn", text: "Analytics →", onclick: () => ctx.navigate("#/analytics") }),
    ]),
  ]);
  if (!weak.length) {
    weakCard.appendChild(el("p", { class: "muted small", text: "Answer a few questions and your weak areas will show up here." }));
  } else {
    const rows = el("div");
    for (const w of weak) {
      const tone = w.accuracy < 55 ? "low" : w.accuracy < 75 ? "mid" : "";
      rows.appendChild(
        el("div", { class: "bar-row" }, [
          el("div", { class: "bar-label", title: w.subject, text: w.subject }),
          el("div", { class: "bar-track" }, [el("div", { class: `bar-fill ${tone}`, style: `width:${w.accuracy}%` })]),
          el("div", { class: "bar-val", text: `${w.accuracy}%` }),
        ])
      );
    }
    weakCard.appendChild(rows);
  }
  cols.appendChild(weakCard);
  root.appendChild(cols);

  // Recent activity
  const recent = el("div", { class: "card mt-3" }, [
    el("div", { class: "card-head" }, [
      el("h3", { text: "Recent activity" }),
      el("button", { class: "link-btn", text: "All history →", onclick: () => ctx.navigate("#/history") }),
    ]),
  ]);
  const recentList = [...timeline.timeline].reverse().slice(0, 5);
  if (!recentList.length) {
    recent.appendChild(el("p", { class: "muted small", text: "No completed sessions yet." }));
  } else {
    for (const a of recentList) {
      recent.appendChild(
        el("div", { class: "list-row" }, [
          scoreRing(a.score || 0),
          el("div", { class: "grow" }, [
            el("div", { class: "list-title", text: `${a.mode === "exam" ? "Mock exam" : "Practice"} · ${a.total} questions` }),
            el("div", { class: "list-sub", text: `${a.correct}/${a.total} correct · ${fmtDate(a.finishedAt)}` }),
          ]),
          el("span", { class: `badge ${scoreTone(a.score || 0)}`, text: `${Math.round(a.score || 0)}%` }),
          el("button", { class: "btn ghost sm", onclick: () => ctx.navigate(`#/review/${a.id}`) }, "Review"),
        ])
      );
    }
  }
  root.appendChild(recent);

  root.appendChild(developerSection());
}

const DEVELOPER = {
  name: "Abdulfetah Kedir",
  title: "Anesthesia Student",
  bio: "Anesthesia student focused on evidence-based exam preparation and clinical reasoning. I built this platform to help students and future graduates prepare confidently with real, high-quality questions.",
  initials: "AK",
  links: [
    { label: "Email", href: "mailto:abdulfetahkedir6@gmail.com", text: "abdulfetahkedir6@gmail.com" },
    { label: "GitHub", href: "https://github.com/Feta121" },
    // { label: "Telegram", href: "https://t.me/your_handle" },
  ],
};

function developerSection() {
  const card = el("div", { class: "card mt-3" });

  card.appendChild(el("div", { class: "eyebrow", text: "About the developer" }));

  const avatar = el("div", {
    class: "avatar",
    style:
      "width:60px;height:60px;font-size:1.35rem;background:linear-gradient(150deg,var(--brand-500),var(--brand-700))",
    text: DEVELOPER.initials,
  });

  const info = el("div", { class: "grow" }, [
    el("div", { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap" }, [
      el("h3", { style: "margin:0", text: DEVELOPER.name }),
      el("span", { class: "badge brand", text: DEVELOPER.title }),
    ]),
    el("p", { class: "muted small mt-1", style: "margin-bottom:0", text: DEVELOPER.bio }),
  ]);

  card.appendChild(
    el("div", { style: "display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap" }, [avatar, info])
  );

  const links = el("div", { class: "btn-row mt-2" });
  for (const l of DEVELOPER.links) {
    links.appendChild(
      el("a", {
        class: "btn ghost sm",
        href: l.href,
        target: l.href.startsWith("http") ? "_blank" : null,
        rel: l.href.startsWith("http") ? "noopener" : null,
      })
    );
    const last = links.lastChild;
    last.textContent = l.text ? `${l.label}: ${l.text}` : l.label;
  }
  card.appendChild(links);

  card.appendChild(
    el("p", {
      class: "tiny soft mt-2",
      style: "margin-bottom:0",
      text: "This platform is for educational use and is not a substitute for clinical judgement or official guidelines.",
    })
  );

  return card;
}

function statTile(icon, value, label, hint) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-ico", text: icon }),
    el("div", { class: "stat-value", text: String(value) }),
    el("div", { class: "stat-label", text: label }),
    el("div", { class: "stat-hint", text: hint }),
  ]);
}

function actionRow(title, sub, cta, onClick) {
  return el("div", { class: "list-row" }, [
    el("div", { class: "grow" }, [
      el("div", { class: "list-title", text: title }),
      el("div", { class: "list-sub", text: sub }),
    ]),
    el("button", { class: "btn subtle sm", onclick: onClick }, cta),
  ]);
}
