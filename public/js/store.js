// Global client store

import { api } from "./api.js";
import { storage } from "./storage.js";

export const store = {
  user: null,
  summary: null,
  subjects: [],
  sources: [],
  bookmarkIds: new Set(),
  pendingSetup: null, // passed from dashboard shortcuts to setup views
  theme: storage.get("amx_theme") || "light",
};

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", store.theme);
}

export function toggleTheme() {
  store.theme = store.theme === "dark" ? "light" : "dark";
  storage.set("amx_theme", store.theme);
  applyTheme();
}

let catalogPromise = null;
export function loadCatalog(force = false) {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    const [summary, subjects, sources] = await Promise.all([
      api.summary(),
      api.subjects(),
      api.sources(),
    ]);
    store.summary = summary;
    store.subjects = subjects.subjects;
    store.sources = sources.sources;
    return store;
  })();
  return catalogPromise;
}

export async function loadBookmarks() {
  const res = await api.bookmarks();
  store.bookmarkIds = new Set(res.questions.map((q) => q.id));
  return store.bookmarkIds;
}

export function clearSession() {
  store.user = null;
  store.bookmarkIds = new Set();
  catalogPromise = null;
}
