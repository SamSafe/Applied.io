#!/usr/bin/env node
// Loads synthetic demo applications into the LOCAL D1 database for one signed-in user.
// Every company here is fictional. Email-originated steps simulate the M3–M4 pipeline, and
// three of them are left unseen so the "updates" state shows.
//
// Usage: pnpm seed:dev <email> [--reset]
//   The user must have signed in locally once. --reset deletes their applications first.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [email, ...flags] = process.argv.slice(2);
if (!email) {
  console.error("Usage: pnpm seed:dev <email> [--reset]");
  process.exit(2);
}

const DAY = 86_400_000;
const now = Date.now();
const iso = (daysAgo, hour = 10) => {
  const d = new Date(now - daysAgo * DAY);
  d.setUTCHours(hour, (daysAgo * 37) % 60, 0, 0);
  return d.toISOString();
};
const later = (isoDate, hours) => new Date(Date.parse(isoDate) + hours * 3_600_000).toISOString();
const sql = (v) =>
  v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
const key = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const userId = `(SELECT id FROM user WHERE email = ${sql(email)})`;

// [company, role, source, location, steps]; a step is [daysAgo, kind, value, origin, unseen?, note?]
const APPS = [
  [
    "Northwind Payments",
    "Senior Software Engineer, Payments",
    "LinkedIn",
    "Remote (US)",
    [
      [52, "applied"],
      [45, "advanced", "screen", "email"],
      [38, "advanced", "interview", "email"],
      [30, "advanced", "interview", "email", false, "Second round: system design"],
      [21, "advanced", "final", "email"],
      [6, "advanced", "offer", "email", true],
    ],
  ],
  [
    "Kestrel Robotics",
    "Software Engineer II, Autonomy",
    "Company website",
    "Pittsburgh, PA",
    [
      [40, "applied"],
      [33, "advanced", "screen", "email"],
      [25, "advanced", "interview", "manual"],
      [18, "closed", "rejected", "email"],
    ],
  ],
  ["Halcyon Labs", "Platform Engineer", "LinkedIn", "Remote", [[34, "applied"]]],
  [
    "Brightline Health",
    "Full-Stack Engineer",
    "Referral",
    "Boston, MA",
    [
      [29, "applied"],
      [20, "advanced", "screen", "manual", false, "Recruiter call went well"],
    ],
  ],
  [
    "Tidepool Analytics",
    "Data Engineer",
    "Indeed",
    "Remote",
    [
      [26, "applied"],
      [23, "closed", "rejected", "email"],
    ],
  ],
  [
    "Fernway",
    "Frontend Engineer",
    "LinkedIn",
    "New York, NY",
    [
      [24, "applied"],
      [14, "advanced", "screen", "email"],
      [3, "advanced", "interview", "email", true],
    ],
  ],
  [
    "Quillmark",
    "Staff Engineer, Developer Tools",
    "Recruiter",
    "San Francisco, CA",
    [
      [60, "applied"],
      [52, "advanced", "screen", "email"],
      [41, "closed", "withdrawn", "manual", false, "Role became fully on-site"],
    ],
  ],
  [
    "Larchmont Bank",
    "Software Engineer, Risk Platform",
    "Company website",
    "Charlotte, NC",
    [[70, "applied"]],
  ],
  ["Orbital Freight", "Backend Engineer", "LinkedIn", "Remote (US)", [[18, "applied"]]],
  [
    "Juniper Studios",
    "Product Engineer",
    "Referral",
    "Austin, TX",
    [
      [12, "applied"],
      [9, "advanced", "screen", "email"],
      [4, "advanced", "interview", "manual"],
    ],
  ],
  [
    "Cobalt Insurance",
    "Senior Engineer",
    "Indeed",
    "Hartford, CT",
    [
      [45, "applied"],
      [40, "advanced", "screen", "email"],
    ],
  ],
  ["Sable Systems", "Site Reliability Engineer", "LinkedIn", "Remote", [[9, "applied"]]],
  [
    "Meridian Learning",
    "Software Engineer, Mobile",
    "Company website",
    "Chicago, IL",
    [[6, "applied"]],
  ],
  [
    "Pinecrest Energy",
    "Software Engineer",
    "LinkedIn",
    "Denver, CO",
    [
      [31, "applied"],
      [2, "closed", "rejected", "email", true],
    ],
  ],
  ["Aster & Vale", "Full-Stack Developer", "Referral", "Remote", [[3, "applied"]]],
  [
    "Driftwood Games",
    "Gameplay Engineer",
    "Company website",
    "Seattle, WA",
    [
      [48, "applied"],
      [42, "advanced", "screen", "email"],
      [35, "advanced", "interview", "manual"],
      [28, "closed", "rejected", "email"],
    ],
  ],
  [
    "Lumen Civic",
    "Software Engineer, Civic Tech",
    "LinkedIn",
    "Washington, DC",
    [
      [15, "applied"],
      [11, "advanced", "screen", "email"],
    ],
  ],
];

const statements = [];
if (flags.includes("--reset"))
  statements.push(`DELETE FROM application WHERE user_id = ${userId};`);

for (const [company, position, source, location, steps] of APPS) {
  const appId = randomUUID().replaceAll("-", "");
  const firstUnseen = steps.find((s) => s[4]);
  // Seen just before the first unseen step arrived, or yesterday.
  const seenAt = firstUnseen ? later(iso(firstUnseen[0]), 1) : iso(1);
  statements.push(
    `INSERT INTO application (id, user_id, company, company_key, position, position_key, location, source, created_via, created_at, seen_at) VALUES (${sql(appId)}, ${userId}, ${sql(company)}, ${sql(key(company))}, ${sql(position)}, ${sql(key(position))}, ${sql(location)}, ${sql(source)}, 'manual', ${sql(iso(steps[0][0]))}, ${sql(seenAt)});`,
  );
  for (const [daysAgo, kind, value, origin = "manual", unseen = false, note = null] of steps) {
    const occurredAt = iso(daysAgo, 9 + (daysAgo % 8));
    const recordedAt = origin === "email" ? later(occurredAt, unseen ? 2 : 0.2) : occurredAt;
    statements.push(
      `INSERT INTO event (id, application_id, user_id, type, stage, outcome, occurred_at, recorded_at, origin, certainty, note) VALUES (${sql(randomUUID().replaceAll("-", ""))}, ${sql(appId)}, ${userId}, ${sql(kind)}, ${sql(kind === "advanced" ? value : null)}, ${sql(kind === "closed" ? value : null)}, ${sql(occurredAt)}, ${sql(recordedAt)}, ${sql(origin)}, ${sql(origin === "email" ? "high" : null)}, ${sql(note)});`,
    );
  }
}

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "worker");
const file = join(workerDir, ".wrangler", "seed-dev.sql");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${statements.join("\n")}\n`);
execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", "--local", "--file", file], {
  cwd: workerDir,
  stdio: "inherit",
});
console.log(`Seeded ${APPS.length} synthetic applications for ${email}.`);
