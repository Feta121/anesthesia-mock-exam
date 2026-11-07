import { api } from "../api.js";
import { store } from "../store.js";
import { storage } from "../storage.js";
import { el, debounce, toast } from "../utils.js";
import { metaBadges, renderOptions, explanationBlock, bookmarkButton } from "../components.js";

export async function render(root, ctx) {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "page-head" }, [
      el("div", {}, [
        el("div", { class: "eyebrow", text: "Study bank" }),
        el("h1", { text: "Question bank" }),
        el("p", { class: "lede", text: `Browse and search all ${store.summary?.totalQuestions || ""} sourced questions. Reveal answers at your own pace.` }),
      ]),
    ])
  );

  const savedLimit = parseInt(storage.get("amx_per_page"), 10);
  const state = {
    search: "",
    subject: "",
    source: "",
    page: 1,
    limit: [5, 10, 15, 25, 50].includes(savedLimit) ? savedLimit : 5,
  };

  const searchInput = el("input", { class: "input", placeholder: "Search question text or options..." });
  searchInput.value = state.search;

  const subjectSelect = el("select", { class: "select" });
  subjectSelect.appendChild(el("option", { value: "", text: "All subjects" }));
  for (const s of store.subjects) subjectSelect.appendChild(el("option", { value: s.subject, text: `${s.subject} (${s.total})` }));

  const sourceSelect = el("select", { class: "select" });
  sourceSelect.appendChild(el("option", { value: "", text: "All sources" }));
  for (const s of store.sources) sourceSelect.appendChild(el("option", { value: s.source, text: `${s.source} (${s.total})` }));

  const perPageSelect = el("select", { class: "select", id: "per-page" });
  for (const n of [5, 10, 15, 25, 50]) {
    perPageSelect.appendChild(el("option", { value: n, text: `${n} per page`, selected: n === state.limit }));
  }
  perPageSelect.value = String(state.limit);

  const onlyEligible = el("input", { type: "checkbox", id: "only-eligible" });

  const filterBar = el("div", { class: "card mb-2" }, [
    el("div", { class: "grid cols-4" }, [
      el("div", { class: "field mb-0" }, [el("label", { text: "Search" }), searchInput]),
      el("div", { class: "field mb-0" }, [el("label", { text: "Subject" }), subjectSelect]),
      el("div", { class: "field mb-0" }, [el("label", { text: "Source" }), sourceSelect]),
      el("div", { class: "field mb-0" }, [el("label", { text: "Questions per page" }), perPageSelect]),
    ]),
    el("label", { class: "small muted mt-1", style: "display:flex;align-items:center;gap:8px;cursor:pointer" }, [
      onlyEligible,
      el("span", { text: "Only questions with a verified answer key" }),
    ]),
  ]);
  root.appendChild(filterBar);

  const resultsHost = el("div");
  const pagerHost = el("div", { class: "btn-row mt-2" });
  root.appendChild(resultsHost);
  root.appendChild(pagerHost);

  const reload = async () => {
    resultsHost.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
    pagerHost.innerHTML = "";
    try {
      const res = await api.questions({
        search: state.search,
        subject: state.subject,
        source: state.source,
        eligible: onlyEligible.checked ? "1" : "",
        page: state.page,
        limit: state.limit,
      });
      resultsHost.innerHTML = "";
      if (!res.questions.length) {
        resultsHost.appendChild(el("div", { class: "empty" }, [el("div", { class: "big", text: "🔍" }), el("div", { text: "No questions match your filters." })]));
        return;
      }
      resultsHost.appendChild(el("div", { class: "tiny muted mb-1", text: `${res.total} questions · page ${res.page} of ${res.pages}` }));
      for (const q of res.questions) resultsHost.appendChild(studyCard(q, ctx));
      // pager
      if (res.pages > 1) {
        pagerHost.append(
          el("button", { class: "btn ghost sm", disabled: res.page <= 1, onclick: () => { state.page--; reload(); } }, "← Previous"),
          el("span", { class: "small muted", text: `Page ${res.page} / ${res.pages}` }),
          el("button", { class: "btn ghost sm", disabled: res.page >= res.pages, onclick: () => { state.page++; reload(); } }, "Next →")
        );
      }
    } catch (err) {
      toast(err.message, "err");
    }
  };

  const resetPage = () => {
    state.page = 1;
    reload();
  };
  searchInput.oninput = debounce(() => { state.search = searchInput.value.trim(); resetPage(); }, 300);
  subjectSelect.onchange = () => { state.subject = subjectSelect.value; resetPage(); };
  sourceSelect.onchange = () => { state.source = sourceSelect.value; resetPage(); };
  perPageSelect.onchange = () => {
    state.limit = parseInt(perPageSelect.value, 10) || 5;
    storage.set("amx_per_page", String(state.limit));
    resetPage();
  };
  onlyEligible.onchange = resetPage;

  reload();
}

function studyCard(q, ctx) {
  const card = el("div", { class: "card mb-2" });
  card.appendChild(metaBadges(q));
  card.appendChild(el("div", { class: "q-stem", text: q.question }));
  const optsWrap = el("div", { class: "mt-2" });
  card.appendChild(optsWrap);

  let revealed = false;
  const renderOpts = () =>
    renderOptions(optsWrap, q, {
      reveal: revealed,
      correctAnswer: q.correctAnswer,
      selected: revealed ? q.correctAnswer : null,
    });
  renderOpts();

  const explainWrap = el("div");
  const actions = el("div", { class: "btn-row mt-2" });
  const toggleBtn = el("button", { class: "btn ghost sm", onclick: () => {
    revealed = !revealed;
    toggleBtn.textContent = revealed ? "Hide answer" : "Show answer";
    renderOpts();
    explainWrap.innerHTML = "";
    if (revealed) {
      const ex = explanationBlock(q);
      if (ex) explainWrap.appendChild(ex);
    }
  } }, "Show answer");
  actions.append(toggleBtn, bookmarkButton(q.id));
  card.append(actions, explainWrap);
  return card;
}
