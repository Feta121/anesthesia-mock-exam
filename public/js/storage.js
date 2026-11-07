// Safe storage: some browsers/privacy modes/extensions throw on localStorage
// access, which would otherwise crash the whole module at import time.

const memory = new Map();

let available = true;
try {
  const probe = "__amx_probe__";
  window.localStorage.setItem(probe, "1");
  window.localStorage.removeItem(probe);
} catch {
  available = false;
}

export const storage = {
  get(key) {
    if (available) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        /* fall through */
      }
    }
    return memory.has(key) ? memory.get(key) : null;
  },
  set(key, value) {
    if (available) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        /* fall through */
      }
    }
    memory.set(key, value);
  },
  remove(key) {
    if (available) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    memory.delete(key);
  },
};
