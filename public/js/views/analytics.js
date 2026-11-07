import { api } from "../api.js";
import { store } from "../store.js";
import { el, fmtDuration, toast } from "../utils.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Insights" }),
        el("h1", { text: "Performance analytics" }),
        el("p", { class: "lede", text: "Identify weak areas and track your improvement over time." }),
      ]),
      el("button", {
        class: "btn",
        onclick: () => {
          store.pendingSetup = { pool: "incorrect", count: 20 };
          ctx.navigate("#/practice");
        },
      }, "Practice my mistakes"),
    ])
  );

  let overview, subjStats, topicStats, timeline;
  try {
    [overview, subjStats, topicStats, timeline] = await Promise.all([
      api.overview(),
      api.statsSubjects(),
      api.statsTopics(),
      api.timeline(),
    ]);
  } catch (err) {
    toast(err.message, "err");
    return;
  }

  root.appendChild(
    el("div", { class: "grid cols-4" }, [
      tile(`${overview.overallAccuracy}%`, "Overall accuracy", `${overview.correctCount}/${overview.questionsAnswered}`),
      tile(String(overview.distinctAnswered), "Unique questions seen", `of ${overview.bankSize} in bank`),
      tile(String(overview.finishedAttempts), "Sessions", `${fmtDuration(overview.totalStudySeconds)} studied`),
      tile(`${overview.averageScore}%`, "Average score", `best ${overview.bestScore}%`),
    ])
  );

  if (overview.questionsAnswered === 0) {
    root.appendChild(
      el("div", { class: "empty mt-3" }, [
        el("div", { class: "big", text: "◔" }),
        el("div", { text: "No data yet." }),
        el("p", { class: "muted small", text: "Complete a practice or mock exam session to unlock analytics." }),
      ])
    );
    return;
  }

  // Timeline chart
  const chartCard = el("div", { class: "card mt-3" }, [
    el("div", { class: "card-head" }, [el("h3", { text: "Score trend" }), el("span", { class: "tiny muted", text: "per completed session" })]),
    timelineChart(timeline.timeline),
  ]);
  root.appendChild(chartCard);

  const cols = el("div", { class: "grid cols-2 mt-3" });
  cols.appendChild(barCard("Accuracy by subject", subjStats.subjects, "No subject data yet."));
  cols.appendChild(barCard("Weakest topics", topicStats.topics.slice(0, 12), "No topic data yet."));
  root.appendChild(cols);
}

function tile(value, label, hint) {
  return el("div", { class: "card stat-card" }, [
    el("div", { class: "stat-value", text: value }),
    el("div", { class: "stat-label", text: label }),
    el("div", { class: "stat-hint", text: hint }),
  ]);
}

function barCard(title, rows, emptyText) {
  const card = el("div", { class: "card" }, [el("div", { class: "card-head" }, [el("h3", { text: title })])]);
  if (!rows.length) {
    card.appendChild(el("p", { class: "muted small", text: emptyText }));
    return card;
  }
  for (const r of rows) {
    const label = r.subject ? `${r.topic}` : r.subject;
    const tone = r.accuracy < 55 ? "low" : r.accuracy < 75 ? "mid" : "";
    card.appendChild(
      el("div", { class: "bar-row" }, [
        el("div", { class: "bar-label", title: `${r.subject || ""} ${r.topic || ""}`, text: r.topic || r.subject }),
        el("div", { class: "bar-track" }, [el("div", { class: `bar-fill ${tone}`, style: `width:${r.accuracy}%` })]),
        el("div", { class: "bar-val", text: `${r.accuracy}% · ${r.correct}/${r.answered}` }),
      ])
    );
  }
  return card;
}

function timelineChart(points) {
  if (!points.length) return el("p", { class: "muted small", text: "No completed sessions yet." });
  const w = 760;
  const h = 190;
  const pad = 28;
  const max = 100;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.score || 0) / max) * (h - pad * 2);
    return { x, y, score: p.score || 0 };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${h - pad} L${coords[0].x.toFixed(1)},${h - pad} Z`;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("preserveAspectRatio", "none");

  const grid = [0, 25, 50, 75, 100];
  for (const g of grid) {
    const y = h - pad - (g / max) * (h - pad * 2);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad);
    line.setAttribute("x2", w - pad);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--border)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", 4);
    t.setAttribute("y", y + 4);
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", "var(--text-soft)");
    t.textContent = `${g}%`;
    svg.appendChild(t);
  }

  const areaPath = document.createElementNS(svgNS, "path");
  areaPath.setAttribute("d", area);
  areaPath.setAttribute("fill", "rgba(20,184,166,0.14)");
  svg.appendChild(areaPath);

  const linePath = document.createElementNS(svgNS, "path");
  linePath.setAttribute("d", path);
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", "var(--brand-600)");
  linePath.setAttribute("stroke-width", "2.5");
  linePath.setAttribute("stroke-linejoin", "round");
  svg.appendChild(linePath);

  for (const c of coords) {
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", c.x);
    dot.setAttribute("cy", c.y);
    dot.setAttribute("r", "3.4");
    dot.setAttribute("fill", "var(--brand-700)");
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${c.score}%`;
    dot.appendChild(title);
    svg.appendChild(dot);
  }

  return svg;
}
