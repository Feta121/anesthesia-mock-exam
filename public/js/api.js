// Thin API client with token handling

import { storage } from "./storage.js";

const TOKEN_KEY = "amx_token";

export function getToken() {
  return storage.get(TOKEN_KEY);
}

export function setToken(token) {
  if (token) storage.set(TOKEN_KEY, token);
  else storage.remove(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!res.ok) {
    const err = new Error((payload && payload.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const api = {
  // auth
  register: (data) => request("POST", "/auth/register", data),
  login: (data) => request("POST", "/auth/login", data),
  me: () => request("GET", "/auth/me"),

  // catalog
  summary: () => request("GET", "/catalog/summary"),
  subjects: () => request("GET", "/catalog/subjects"),
  sources: () => request("GET", "/catalog/sources"),
  questions: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== "")
    ).toString();
    return request("GET", `/catalog/questions${q ? `?${q}` : ""}`);
  },
  question: (id) => request("GET", `/catalog/questions/${encodeURIComponent(id)}`),

  // attempts
  startAttempt: (data) => request("POST", "/attempts", data),
  answer: (id, data) => request("POST", `/attempts/${id}/answer`, data),
  submit: (id, data) => request("POST", `/attempts/${id}/submit`, data),
  finish: (id, data) => request("POST", `/attempts/${id}/finish`, data),
  attempts: () => request("GET", "/attempts"),
  attempt: (id) => request("GET", `/attempts/${id}`),
  deleteAttempt: (id) => request("DELETE", `/attempts/${id}`),

  // stats
  overview: () => request("GET", "/stats/overview"),
  statsSubjects: () => request("GET", "/stats/subjects"),
  statsTopics: () => request("GET", "/stats/topics"),
  timeline: () => request("GET", "/stats/timeline"),
  incorrect: () => request("GET", "/stats/incorrect"),

  // bookmarks
  bookmarks: () => request("GET", "/bookmarks"),
  addBookmark: (id) => request("POST", `/bookmarks/${encodeURIComponent(id)}`),
  removeBookmark: (id) => request("DELETE", `/bookmarks/${encodeURIComponent(id)}`),
};
