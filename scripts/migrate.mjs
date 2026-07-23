// Applies schema SQL files to the Neon database.
// Usage: node scripts/migrate.mjs
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

function loadEnv() {
  const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(url);
const files = [
  new URL("./dashboard-schema.sql", import.meta.url),
  new URL("./ai-provider-schema.sql", import.meta.url),
];

// Naive splitter: safe here because the schema has no PL/pgSQL bodies.
function statementsFrom(text) {
  return text
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

// Invoke the neon tagged-template client with a single literal chunk (no params).
function run(stmt) {
  const strings = Object.assign([stmt], { raw: [stmt] });
  return sql(strings);
}

let applied = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const stmt of statementsFrom(text)) {
    try {
      await run(stmt);
      applied += 1;
    } catch (err) {
      console.error("Failed statement:\n", stmt, "\n", err.message);
      process.exit(1);
    }
  }
}

console.log(`Migration complete: ${applied} statements applied.`);
