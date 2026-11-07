"use strict";
// Static ES-module syntax check for the browser frontend.
// Parses each module with Node's V8 parser (via vm.SourceTextModule).

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const JS_DIR = path.join(__dirname, "..", "public", "js");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

async function main() {
  const files = walk(JS_DIR);
  let errors = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    try {
      new vm.SourceTextModule(source, { identifier: file });
      console.log("ok  ", path.relative(JS_DIR, file));
    } catch (err) {
      errors++;
      console.error("FAIL", path.relative(JS_DIR, file), "-", err.message);
    }
  }
  console.log(`\n${files.length - errors}/${files.length} modules parsed cleanly`);
  process.exit(errors ? 1 : 0);
}

main();
