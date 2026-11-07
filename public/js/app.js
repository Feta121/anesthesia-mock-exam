import { api, getToken, setToken } from "./api.js";
import { store, applyTheme, loadCatalog, loadBookmarks, clearSession, toggleTheme } from "./store.js";
import { el, qs, toast } from "./utils.js";
import { renderAuth } from "./views/auth.js";

applyTheme();

const NAV = [
  { route: "dashboard", label: "Dashboard", icon: "▦" },
  { route: "practice", label: "Practice", icon: "✎" },
  { route: "exam", label: "Mock Exam", icon: "◷" },
  { route: "browse", label: "Study Bank", icon: "☰" },
  { route: "bookmarks", label: "Bookmarks", icon: "★" },
  { route: "history", label: "History", icon: "↺" },
  { route: "analytics", label: "Analytics", icon: "◔" },
];

const VIEWS = {
  dashboard: () => import("./views/dashboard.js"),
  practice: () => import("./views/practice.js"),
  exam: () => import("./views/exam.js"),
  browse: () => import("./views/browse.js"),
  bookmarks: () => import("./views/bookmarks.js"),
  history: () => import("./views/history.js"),
  review: () => import("./views/review.js"),
  analytics: () => import("./views/analytics.js"),
};

export function navigate(path) {
  if (!path.startsWith("#")) path = "#" + path;
  if (location.hash === path) handleRoute();
  else location.hash = path;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  return { route: parts[0] || "dashboard", params: parts.slice(1) };
}

let currentCleanup = null;

async function handleRoute() {
  if (!store.user) return;
  const { route, params } = parseHash();
  const loader = VIEWS[route] || VIEWS.dashboard;
  const container = qs("#view");
  if (!container) return;
  if (typeof currentCleanup === "function") {
    try { currentCleanup(); } catch {}
    currentCleanup = null;
  }
  container.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
  try {
    const mod = await loader();
    const cleanup = await mod.render(container, { params, navigate });
    if (typeof cleanup === "function") currentCleanup = cleanup;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="muted">${err.message}</p></div>`;
  }
  highlightNav(route);
}

function highlightNav(route) {
  const effective = route === "review" ? "history" : route;
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.route === effective);
  });
  const label = NAV.find((n) => n.route === effective)?.label || "Dashboard";
  document.title = `${label} · Anesthesia Mock Exam`;
}

function buildShell() {
  const app = qs("#app");
  app.innerHTML = "";
  const shell = el("div", { class: "shell" });

  const sidebar = el("aside", { class: "sidebar", id: "sidebar" });
  sidebar.appendChild(
    el("div", { class: "brand" }, [
      el("div", { class: "brand-mark", text: "A" }),
      el("div", {}, [
        el("div", { class: "brand-name", text: "Anesthesia" }),
        el("div", { class: "brand-sub", text: "Mock Exam" }),
      ]),
    ])
  );

  for (const item of NAV) {
    sidebar.appendChild(
      el(
        "button",
        {
          class: "nav-item",
          "data-route": item.route,
          onclick: () => {
            navigate("#/" + item.route);
            closeMobile();
          },
        },
        [el("span", { class: "nav-ico", text: item.icon }), el("span", { text: item.label })]
      )
    );
  }

  sidebar.appendChild(el("div", { class: "nav-spacer" }));
  sidebar.appendChild(
    el("div", { class: "sidebar-foot" }, [
      el("button", { class: "nav-item", onclick: toggleTheme }, [
        el("span", { class: "nav-ico", text: "◐" }),
        el("span", { text: "Toggle theme", id: "theme-label" }),
      ]),
      el("div", { class: "user-chip" }, [
        el("div", { class: "avatar", id: "user-avatar", text: initials(store.user.username) }),
        el("div", { class: "user-meta" }, [
          el("div", { class: "name", text: store.user.username }),
          el("div", { class: "mail", text: store.user.email }),
        ]),
        el("button", {
          class: "link-btn",
          text: "Sign out",
          title: "Sign out",
          onclick: signOut,
        }),
      ]),
    ])
  );

  const topbar = el("div", { class: "topbar" }, [
    el("button", { class: "mobile-menu-btn", text: "☰", onclick: toggleMobile }),
    el("div", { class: "brand-name", text: "Anesthesia Mock Exam" }),
    el("div", { class: "avatar", text: initials(store.user.username) }),
  ]);

  const main = el("main", { class: "main" }, [el("div", { id: "view" })]);
  const contentCol = el("div", {}, [topbar, main]);

  shell.appendChild(sidebar);
  shell.appendChild(contentCol);
  app.appendChild(shell);
  app.hidden = false;
}

function initials(name) {
  return (name || "?").slice(0, 2).toUpperCase();
}

function toggleMobile() {
  const sb = qs("#sidebar");
  const open = sb.classList.toggle("open");
  let scrim = qs(".scrim");
  if (open && !scrim) {
    scrim = el("div", { class: "scrim", onclick: closeMobile });
    document.body.appendChild(scrim);
  } else if (!open && scrim) {
    scrim.remove();
  }
}

function closeMobile() {
  qs("#sidebar")?.classList.remove("open");
  qs(".scrim")?.remove();
}

async function signOut() {
  setToken(null);
  clearSession();
  location.hash = "";
  bootAuth();
}

function bootAuth() {
  const app = qs("#app");
  app.hidden = false;
  renderAuth(app, {
    onSuccess: async (user) => {
      store.user = user;
      await Promise.allSettled([loadCatalog(), loadBookmarks()]);
      buildShell();
      navigate("#/dashboard");
    },
  });
}

async function start() {
  if (typeof window.__amxMarkReady === "function") window.__amxMarkReady();
  await new Promise((r) => setTimeout(r, 250));
  qs("#boot").hidden = true;
  document.documentElement.dataset.appReady = "1";

  window.addEventListener("hashchange", handleRoute);

  if (!getToken()) {
    bootAuth();
    return;
  }
  try {
    const { user } = await api.me();
    store.user = user;
    await Promise.allSettled([loadCatalog(), loadBookmarks()]);
    buildShell();
    if (!location.hash) location.hash = "#/dashboard";
    else handleRoute();
  } catch (err) {
    console.warn("session restore failed", err);
    setToken(null);
    bootAuth();
  }
}

start().catch((err) => {
  console.error("Failed to start app", err);
  document.documentElement.dataset.appReady = "error";
  const boot = document.getElementById("boot");
  if (boot) {
    boot.hidden = false;
    boot.innerHTML =
      '<div class="boot-logo" style="background:#dc2626">!</div>' +
      '<div class="boot-text">The application failed to start</div>' +
      '<pre class="boot-err"></pre>';
    boot.querySelector(".boot-err").textContent = (err && err.stack) || (err && err.message) || String(err);
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message || "Unexpected error";
  if (e.reason?.status === 401) {
    signOut();
    return;
  }
  toast(msg, "err");
});
