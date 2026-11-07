import { api, setToken } from "../api.js";
import { el, toast, withBusy } from "../utils.js";

export function renderAuth(app, { onSuccess }) {
  app.innerHTML = "";
  let mode = "login";

  const wrap = el("div", { class: "auth-wrap" });

  const hero = el("div", { class: "auth-hero" }, [
    el("div", {}, [
      el("div", { class: "brand" }, [
        el("div", { class: "brand-mark", text: "A" }),
        el("div", {}, [
          el("div", { class: "brand-name", text: "Anesthesia" }),
          el("div", { class: "brand-sub", text: "Mock Exam" }),
        ]),
      ]),
    ]),
    el("div", {}, [
      el("h1", { text: "Master anesthesia, one question at a time." }),
      el("p", {
        text: "A complete exam-preparation platform built from 2,900+ real anesthesia questions — practice by subject, sit timed mock exams, and track your weak areas.",
      }),
      el("div", { class: "mt-3" }, [
        feature("2,900+ sourced examination questions"),
        feature("Timed mock exams & random generation"),
        feature("Instant feedback and detailed explanations"),
        feature("Weak-subject analytics and bookmarks"),
      ]),
    ]),
    el("div", { class: "tiny", style: "color:rgba(255,255,255,.6)", text: "For educational use. Always follow current clinical guidelines." }),
  ]);

  const tabs = el("div", { class: "auth-tabs seg" });
  const tabLogin = el("button", { class: "active", text: "Sign in" });
  const tabReg = el("button", { text: "Create account" });
  tabs.append(tabLogin, tabReg);

  const formHost = el("div");
  const panel = el("div", { class: "auth-panel" }, [
    el("div", { class: "auth-card" }, [
      el("h2", { text: "Welcome back", id: "auth-title" }),
      el("p", { class: "muted", id: "auth-sub", text: "Sign in to continue your preparation." }),
      tabs,
      formHost,
    ]),
  ]);

  wrap.append(hero, panel);
  app.appendChild(wrap);

  function feature(text) {
    return el("div", { class: "auth-feature" }, [el("span", { class: "dot" }), el("span", { text })]);
  }

  function buildForm() {
    formHost.innerHTML = "";
    const isLogin = mode === "login";
    document.getElementById("auth-title").textContent = isLogin ? "Welcome back" : "Create your account";
    document.getElementById("auth-sub").textContent = isLogin
      ? "Sign in to continue your preparation."
      : "Start practising in seconds — it's free.";

    const username = el("input", { class: "input", id: "f-username", placeholder: "e.g. demo", autocomplete: "username" });
    const email = el("input", { class: "input", id: "f-email", type: "email", placeholder: "you@example.com", autocomplete: "email" });
    const password = el("input", { class: "input", id: "f-password", type: "password", placeholder: "At least 6 characters", autocomplete: isLogin ? "current-password" : "new-password" });

    const submit = el("button", { class: "btn block lg" }, isLogin ? "Sign in" : "Create account");

    const form = el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        const payload = {
          username: username.value.trim(),
          password: password.value,
        };
        if (!isLogin) payload.email = email.value.trim();
        if (!payload.username || !payload.password) return toast("Please fill in all fields", "err");
        try {
          await withBusy(submit, async () => {
            const res = isLogin ? await api.login(payload) : await api.register(payload);
            setToken(res.token);
            toast(isLogin ? "Welcome back!" : "Account created", "ok");
            await onSuccess(res.user);
          });
        } catch (err) {
          toast(err.message, "err");
        }
      },
    });

    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Username" }), username]));
    if (!isLogin) form.appendChild(el("div", { class: "field" }, [el("label", { text: "Email" }), email]));
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Password" }), password]));
    form.appendChild(submit);

    if (isLogin) {
      form.appendChild(
        el("p", { class: "small muted mt-2" }, [
          "Demo account — ",
          el("button", {
            type: "button",
            class: "link-btn",
            text: "use demo / demo1234",
            onclick: () => {
              username.value = "demo";
              password.value = "demo1234";
            },
          }),
        ])
      );
    }

    formHost.appendChild(form);
  }

  tabLogin.onclick = () => {
    mode = "login";
    tabLogin.classList.add("active");
    tabReg.classList.remove("active");
    buildForm();
  };
  tabReg.onclick = () => {
    mode = "register";
    tabReg.classList.add("active");
    tabLogin.classList.remove("active");
    buildForm();
  };

  buildForm();
}
