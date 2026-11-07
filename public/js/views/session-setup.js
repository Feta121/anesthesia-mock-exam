import { store } from "../store.js";
import { el, toast } from "../utils.js";

export function setupPanel(mode, onStart) {
  const subjects = store.subjects;
  const sources = store.sources;

  const state = {
    pool: "all",
    subject: "",
    topic: "",
    source: "",
    count: mode === "exam" ? 50 : 10,
    timeLimit: mode === "exam" ? 75 : 0,
  };

  // Apply any pending setup hint from dashboard
  if (store.pendingSetup) {
    Object.assign(state, store.pendingSetup);
    store.pendingSetup = null;
  }
  if (mode !== "exam") delete state.timeLimit;

  const card = el("div", { class: "card" });

  // Focus segmented control
  const focus = el("div", { class: "seg" });
  const focusOptions = [
    ["all", "All questions"],
    ["subject", "By subject"],
    ["incorrect", "My mistakes"],
    ["bookmarked", "Bookmarked"],
    ["unseen", "Not yet seen"],
  ];
  const focusButtons = {};
  for (const [val, label] of focusOptions) {
    const b = el("button", { text: label, class: state.pool === val ? "active" : "" });
    b.onclick = () => {
      state.pool = val;
      Object.values(focusButtons).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      subjectWrap.classList.toggle("hidden", !(val === "subject" || val === "all"));
    };
    focusButtons[val] = b;
    focus.appendChild(b);
  }

  const subjectSelect = el("select", { class: "select" });
  subjectSelect.appendChild(el("option", { value: "", text: "All subjects" }));
  for (const s of subjects) subjectSelect.appendChild(el("option", { value: s.subject, text: `${s.subject} (${s.total})` }));

  const topicSelect = el("select", { class: "select" });
  const refreshTopics = () => {
    topicSelect.innerHTML = "";
    topicSelect.appendChild(el("option", { value: "", text: "All topics" }));
    const subj = subjects.find((s) => s.subject === subjectSelect.value);
    if (subj) for (const t of subj.topics) topicSelect.appendChild(el("option", { value: t.topic, text: `${t.topic} (${t.total})` }));
    topicSelect.disabled = !subj;
  };
  subjectSelect.onchange = () => {
    state.subject = subjectSelect.value;
    state.topic = "";
    refreshTopics();
    refreshCountHint();
  };
  topicSelect.onchange = () => {
    state.topic = topicSelect.value;
  };
  refreshTopics();

  const sourceSelect = el("select", { class: "select" });
  sourceSelect.appendChild(el("option", { value: "", text: "All sources" }));
  for (const s of sources) sourceSelect.appendChild(el("option", { value: s.source, text: `${s.source} (${s.total})` }));
  sourceSelect.onchange = () => {
    state.source = sourceSelect.value;
  };

  const countSelect = el("select", { class: "select" });
  for (const n of [10, 20, 30, 50, 100]) {
    countSelect.appendChild(el("option", { value: n, text: `${n} questions`, selected: n === state.count }));
  }
  countSelect.value = String(state.count);
  countSelect.onchange = () => {
    state.count = parseInt(countSelect.value, 10);
    if (mode === "exam") updateDefaultTime();
  };

  const timeInput = el("input", { class: "input", type: "number", min: "1", max: "600", value: state.timeLimit });
  if (mode === "exam") timeInput.oninput = () => (state.timeLimit = parseInt(timeInput.value, 10) || 0);

  const countHint = el("div", { class: "form-hint" });
  function refreshCountHint() {
    let available = store.summary?.examEligible || 0;
    if (state.subject) {
      const s = subjects.find((x) => x.subject === state.subject);
      available = s ? s.eligible : 0;
    }
    countHint.textContent = `${available} exam-ready questions match the current filters.`;
  }
  refreshCountHint();

  function updateDefaultTime() {
    state.timeLimit = Math.round((state.count * 1.5));
    timeInput.value = state.timeLimit;
  }

  const subjectWrap = el("div", { class: "grid cols-2" });
  subjectWrap.append(
    el("div", { class: "field" }, [el("label", { text: "Subject" }), subjectSelect]),
    el("div", { class: "field" }, [el("label", { text: "Topic" }), topicSelect])
  );

  subjectWrap.classList.toggle("hidden", !(state.pool === "subject" || state.pool === "all"));

  const startBtn = el("button", { class: "btn lg" }, mode === "exam" ? "Begin mock exam" : "Start practice");
  startBtn.onclick = () => {
    if (state.pool === "subject" && !state.subject) {
      toast("Choose a subject first", "err");
      return;
    }
    onStart({
      mode,
      pool: state.pool,
      subject: state.subject || null,
      topic: state.topic || null,
      source: state.source || null,
      count: state.count,
      timeLimit: mode === "exam" ? state.timeLimit * 60 : null,
    });
  };

  card.append(
    el("div", { class: "field" }, [el("label", { text: "Question source" }), focus]),
    el("div", { class: "mt-2" }, [subjectWrap]),
    el("div", { class: "grid cols-2" }, [
      el("div", { class: "field" }, [el("label", { text: "Source document" }), sourceSelect]),
      el("div", { class: "field" }, [
        el("label", { text: "Number of questions" }),
        countSelect,
        el("div", { class: "mt-1" }, [countHint]),
      ]),
    ]),
    mode === "exam"
      ? el("div", { class: "field" }, [
          el("label", { text: "Time limit (minutes)" }),
          timeInput,
          el("div", { class: "form-hint", text: "Exam auto-submits when the timer reaches zero." }),
        ])
      : null,
    el("div", { class: "btn-row mt-2" }, [startBtn])
  );

  return card;
}
