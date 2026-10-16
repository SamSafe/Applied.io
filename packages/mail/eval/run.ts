/**
 * Classifier eval (docs/EMAIL_PIPELINE.md → "Accuracy and evals").
 *
 *   pnpm --filter @apptracker/mail eval              prefilter only, plus a cost estimate
 *   pnpm --filter @apptracker/mail eval --yes        also classify with Claude (spends money)
 *   add --private to include fixtures/private (your own emails; never committed)
 */
import { mkdir, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeCompany, titleSimilarity } from "@apptracker/core";
import {
  CLASSIFIER_MODEL,
  CLASSIFIER_VERSION,
  type Classification,
  classifyEmail,
} from "../src/index";
import { loadSet, mapLimit, type Sample } from "./corpus";

const args = new Set(process.argv.slice(2));
const sets = args.has("--private") ? (["public", "private"] as const) : (["public"] as const);
const samples = (await Promise.all(sets.map(loadSet))).flat();
const labelled = samples.filter((s) => s.label);

// Prices per million tokens for the chosen model (Claude Haiku 5.5).
const PRICE = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
const TARGET = { category: 0.95, company: 0.9 };

console.log(`Classifier ${CLASSIFIER_VERSION} (${CLASSIFIER_MODEL}) · sets: ${sets.join(", ")}`);
console.log(`${samples.length} emails, ${labelled.length} labelled\n`);

// ── Prefilter ──────────────────────────────────────────────────────────────────────────
const relevantLabels = labelled.filter((s) => s.label?.relevant);
const missed = relevantLabels.filter((s) => !s.prefilter.relevant);
const wronglyKept = labelled.filter((s) => !s.label?.relevant && s.prefilter.relevant);
console.log("Prefilter");
console.log(
  `  recall on relevant mail  ${pct(relevantLabels.length - missed.length, relevantLabels.length)}`,
);
console.log(`  noise kept               ${wronglyKept.length}`);
for (const s of missed) console.log(`  MISSED  ${s.file}  (${s.prefilter.reason})`);
for (const s of wronglyKept) console.log(`  KEPT    ${s.file}  (${s.prefilter.reason})`);

const toClassify = labelled.filter((s) => s.prefilter.relevant);
const estimate = (toClassify.length * (2500 * PRICE.input + 400 * PRICE.output)) / 1e6;
console.log(
  `\n${toClassify.length} emails would be classified · estimated cost ~$${estimate.toFixed(4)}`,
);

if (!args.has("--yes")) {
  console.log("Re-run with --yes to classify them with Claude.");
  process.exit(missed.length === 0 ? 0 : 1);
}

// ── Classifier ─────────────────────────────────────────────────────────────────────────
const client = new Anthropic();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const results = await mapLimit(toClassify, 4, async (s) => {
  try {
    const r = await classifyEmail(client, {
      from: s.original.from,
      subject: s.original.subject,
      sentAt: s.original.sentAt,
      body: s.original.body,
      forwardedBy: s.original.forwardedBy,
    });
    for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += r.usage[k];
    return { sample: s, classification: r.classification, error: null };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error(
        "\nNo valid Anthropic credentials. Set ANTHROPIC_API_KEY or run `ant auth login`.",
      );
      process.exit(2);
    }
    return { sample: s, classification: null, error: String(error) };
  }
});

type Row = { sample: Sample; classification: Classification | null; error: string | null };
const ok = (results as Row[]).filter((r) => r.classification);
const categoryHits = ok.filter((r) => r.classification?.category === r.sample.label?.category);
const companyRows = ok.filter((r) => r.sample.label?.company);
const companyHits = companyRows.filter(
  (r) =>
    normalizeCompany(r.classification?.company ?? "") ===
    normalizeCompany(r.sample.label?.company ?? ""),
);
const positionRows = ok.filter((r) => r.sample.label?.position);
const positionHits = positionRows.filter(
  (r) => titleSimilarity(r.classification?.position ?? "", r.sample.label?.position ?? "") >= 0.8,
);
const kindRows = ok.filter((r) => r.sample.label?.category === "interview_invite");
const kindHits = kindRows.filter(
  (r) => r.classification?.interviewKind === r.sample.label?.interviewKind,
);

console.log("\nClassifier");
console.log(
  `  category       ${pct(categoryHits.length, ok.length)}  (target ${TARGET.category * 100}%)`,
);
console.log(
  `  company        ${pct(companyHits.length, companyRows.length)}  (target ${TARGET.company * 100}%)`,
);
console.log(`  position       ${pct(positionHits.length, positionRows.length)}`);
console.log(`  interview kind ${pct(kindHits.length, kindRows.length)}`);
console.log(`  errors         ${results.length - ok.length}`);

const confusion = new Map<string, Map<string, number>>();
for (const r of ok) {
  const want = r.sample.label?.category ?? "?";
  const got = r.classification?.category ?? "?";
  const row = confusion.get(want) ?? new Map<string, number>();
  row.set(got, (row.get(got) ?? 0) + 1);
  confusion.set(want, row);
}
console.log("\nConfusion (label → predicted)");
for (const [want, row] of [...confusion].sort()) {
  console.log(`  ${want.padEnd(22)} ${[...row].map(([got, n]) => `${got}×${n}`).join("  ")}`);
}

const misses = (results as Row[]).filter(
  (r) =>
    r.error ||
    r.classification?.category !== r.sample.label?.category ||
    (r.sample.label?.company &&
      normalizeCompany(r.classification?.company ?? "") !==
        normalizeCompany(r.sample.label.company)),
);
if (misses.length) console.log("\nMisses");
for (const r of misses) {
  const c = r.classification;
  console.log(
    `  ${r.sample.file}: ${r.error ?? `${c?.category} / ${c?.company ?? "-"} / ${c?.position ?? "-"} (want ${r.sample.label?.category} / ${r.sample.label?.company ?? "-"})`}`,
  );
}

const cost =
  (usage.input * PRICE.input +
    usage.output * PRICE.output +
    usage.cacheRead * PRICE.cacheRead +
    usage.cacheWrite * PRICE.cacheWrite) /
  1e6;
console.log(
  `\nTokens: ${usage.input} in, ${usage.output} out, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write · cost $${cost.toFixed(4)}`,
);

const pass =
  missed.length === 0 &&
  categoryHits.length / Math.max(ok.length, 1) >= TARGET.category &&
  companyHits.length / Math.max(companyRows.length, 1) >= TARGET.company;
console.log(pass ? "\nPASS: meets the M3 targets" : "\nFAIL: below the M3 targets");

await mkdir(new URL("./results/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(
  new URL(`./results/${CLASSIFIER_VERSION}-${stamp}.json`, import.meta.url),
  JSON.stringify(
    {
      version: CLASSIFIER_VERSION,
      model: CLASSIFIER_MODEL,
      sets,
      usage,
      cost,
      rows: (results as Row[]).map((r) => ({
        file: `${r.sample.set}/${r.sample.file}`,
        label: r.sample.label,
        classification: r.classification,
        error: r.error,
      })),
    },
    null,
    2,
  ),
);
process.exit(pass ? 0 : 1);

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}
