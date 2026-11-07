"use strict";
// End-to-end browser test using puppeteer-core + locally installed Chrome.
// Verifies the full UI flow: auth -> dashboard -> practice -> exam -> review -> analytics.

const puppeteer = require("puppeteer-core");
const fs = require("node:fs");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const BASE = `http://localhost:${process.env.PORT || 3000}`;

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("ok:", msg);
  else {
    failures++;
    console.error("FAIL:", msg);
  }
}

async function tap(page, selector) {
  const ok = await page.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return false;
    n.scrollIntoView({ block: "center" });
    n.click();
    return true;
  }, selector);
  if (!ok) throw new Error(`selector not found: ${selector}`);
}

async function tapText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, txt) => {
      const nodes = [...document.querySelectorAll(sel)];
      const node = nodes.find((n) => n.textContent.trim().toLowerCase().includes(txt.toLowerCase()));
      if (!node) return false;
      node.scrollIntoView({ block: "center" });
      node.click();
      return true;
    },
    selector,
    text
  );
  if (!ok) throw new Error(`no ${selector} containing "${text}"`);
}

async function waitText(page, re, timeout = 12000) {
  await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), { timeout }, re);
}

async function main() {
  if (!found) {
    console.error("No Chrome/Edge found; skipping E2E.");
    process.exit(0);
  }

  require("../server/index");
  await new Promise((r) => setTimeout(r, 1200));

  const browser = await puppeteer.launch({
    executablePath: found,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1400,900"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console: ${m.text()}`);
  });

  try {
    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });

    // Auth
    await page.waitForSelector(".auth-tabs", { timeout: 15000 });
    check(true, "auth screen renders");
    await tapText(page, ".auth-tabs button", "Create account");
    await page.waitForSelector("#f-email");
    const user = "e2e_" + Date.now();
    await page.type("#f-username", user);
    await page.type("#f-email", `${user}@test.local`);
    await page.type("#f-password", "secret123");
    await tapText(page, ".auth-card button.btn", "Create account");
    await page.waitForSelector('.nav-item[data-route="dashboard"]', { timeout: 15000 });
    await waitText(page, "Welcome back");
    check(true, "registration -> dashboard");
    // Regression: the boot overlay must actually disappear (not just get [hidden]).
    const bootDisplay = await page.evaluate(() => getComputedStyle(document.getElementById("boot")).display);
    check(bootDisplay === "none", `boot overlay hidden (display:${bootDisplay})`);
    // Real-coordinate click must not be intercepted by any overlay.
    await page.click('.nav-item[data-route="practice"]');
    await waitText(page, "Focused practice");
    await tap(page, '.nav-item[data-route="dashboard"]');
    await waitText(page, "Welcome back");

    // Practice
    await tap(page, '.nav-item[data-route="practice"]');
    await waitText(page, "Focused practice");
    await tapText(page, "button.btn.lg", "Start practice");
    await page.waitForSelector(".option");
    check(true, "practice session started");
    await tap(page, ".option");
    await page.waitForSelector(".feedback");
    check(await page.$eval(".feedback", (n) => /correct|incorrect/i.test(n.textContent)), "practice grades answer");
    check(await page.$(".explanation") != null, "practice reveals explanation");

    // Exam
    await tap(page, '.nav-item[data-route="exam"]');
    await waitText(page, "Mock examination");
    await tapText(page, "button.btn.lg", "Begin mock exam");
    await page.waitForSelector(".timer");
    const timerText = await page.$eval(".timer", (n) => n.textContent.trim());
    check(/\d/.test(timerText), `exam timer running (${timerText})`);
    await tap(page, ".option");
    await tap(page, ".nav-cell:nth-child(2)");
    await tap(page, ".option");
    await tapText(page, "button.btn.accent", "Submit exam");
    await page.waitForSelector(".modal-backdrop");
    await tapText(page, ".modal-actions button", "Submit exam");
    await waitText(page, "Exam submitted");
    check(true, "exam submitted and graded");

    // Review
    await tapText(page, "button.btn", "Review all answers");
    await waitText(page, "review");
    await page.waitForSelector(".option");
    check(true, "review page renders items");

    // Analytics
    await tap(page, '.nav-item[data-route="analytics"]');
    await waitText(page, "Performance analytics");
    await page.waitForSelector(".chart-svg");
    check(true, "analytics renders chart");

    // Study bank
    await tap(page, '.nav-item[data-route="browse"]');
    await waitText(page, "Question bank");
    await page.waitForSelector(".q-stem");
    const perPage = await page.$eval("#per-page", (n) => n.value);
    check(perPage === "5", `study bank default per page = 5 (got ${perPage})`);
    const cardsAt5 = await page.$$eval(".q-stem", (n) => n.length);
    check(cardsAt5 === 5, `study bank shows 5 questions per page (got ${cardsAt5})`);
    await page.select("#per-page", "10");
    await page.waitForFunction(() => document.querySelectorAll(".q-stem").length === 10, { timeout: 10000 });
    check(true, "changing per page re-fetches 10 questions");
    await page.select("#per-page", "5");
    await page.waitForFunction(() => document.querySelectorAll(".q-stem").length === 5, { timeout: 10000 });
    await tapText(page, "button.btn.ghost.sm", "Show answer");
    await page.waitForSelector(".explanation");
    check(true, "study bank reveals answers");

    // Bookmarks
    await tap(page, '.nav-item[data-route="bookmarks"]');
    await waitText(page, "Bookmark");
    check(true, "bookmarks view renders");

    // Theme toggle
    await tapText(page, ".nav-item", "Toggle theme");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    check(theme === "dark" || theme === "light", `theme toggle works (${theme})`);
  } catch (err) {
    failures++;
    console.error("E2E ERROR:", err.message);
    try {
      const info = await page.evaluate(() => ({ hash: location.hash, body: document.body.innerText.slice(0, 300) }));
      console.error("  at hash:", info.hash, "\n  body:", info.body.replace(/\n+/g, " | "));
    } catch {}
  } finally {
    await browser.close();
  }

  const realErrors = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  if (realErrors.length) {
    failures++;
    console.error("Client errors detected:\n" + realErrors.join("\n"));
  } else {
    console.log("ok: no client-side errors");
  }

  console.log(failures ? `\nE2E TEST FAILED (${failures})` : "\nE2E TEST PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
