#!/usr/bin/env node
// Enforces the dependency rules in docs/ARCHITECTURE.md:
//   core   → nothing (no workspace deps, no runtime deps, only relative imports)
//   mail   → core
//   worker → core, mail
//   web    → core (talks to the worker over HTTP only)
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const RULES = {
  "packages/core": { workspace: [], runtimeDeps: false },
  "packages/mail": { workspace: ["@apptracker/core"] },
  "apps/worker": { workspace: ["@apptracker/core", "@apptracker/mail"] },
  "apps/web": { workspace: ["@apptracker/core"] },
};

const errors = [];

for (const [dir, rule] of Object.entries(RULES)) {
  const pkg = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const workspaceDeps = Object.keys(deps).filter((d) => d.startsWith("@apptracker/"));

  for (const dep of workspaceDeps) {
    if (!rule.workspace.includes(dep)) errors.push(`${dir}/package.json: may not depend on ${dep}`);
  }
  if (rule.runtimeDeps === false && Object.keys(pkg.dependencies ?? {}).length > 0) {
    errors.push(`${dir}/package.json: must have no runtime dependencies`);
  }

  for (const file of await sourceFiles(join(root, dir, "src"))) {
    const text = await readFile(file, "utf8");
    for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const where = relative(root, file);
      if (spec.startsWith(".")) {
        if (dir === "apps/web" && /(^|\/)worker(\/|$)/.test(spec)) {
          errors.push(`${where}: web may not import worker code (${spec})`);
        }
        continue;
      }
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (name.startsWith("@apptracker/") && !rule.workspace.includes(name)) {
        errors.push(`${where}: may not import ${name}`);
      }
      if (dir === "packages/core" && !(name === "vitest" && /\.test\.ts$/.test(file))) {
        errors.push(`${where}: core may only use relative imports (found ${spec})`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("dependency rules ok");

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}
