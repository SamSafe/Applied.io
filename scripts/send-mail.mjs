#!/usr/bin/env node
// Delivers a .eml file to the local Worker's email() handler through `wrangler dev`.
// Usage: pnpm mail:send <file.eml> <to-address> [from-address]
import { readFile } from "node:fs/promises";

const [file, to, from = "forwarder@example.test"] = process.argv.slice(2);
if (!file || !to) {
  console.error("Usage: pnpm mail:send <file.eml> <to-address> [from-address]");
  process.exit(2);
}

const base = process.env.WORKER_URL ?? "http://localhost:8787";
const url = new URL("/cdn-cgi/handler/email", base);
url.searchParams.set("from", from);
url.searchParams.set("to", to);

const res = await fetch(url, { method: "POST", body: await readFile(file) });
console.log(`${res.status} ${res.statusText}`, await res.text());
process.exit(res.ok ? 0 : 1);
