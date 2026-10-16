/**
 * Prepares labels for your private corpus. Drop exported .eml files into
 * packages/mail/fixtures/private/ (gitignored), run this, then correct labels.json by hand.
 *
 *   pnpm --filter @apptracker/mail label          prefills from the prefilter only
 *   pnpm --filter @apptracker/mail label --yes    also prefills category/company/position with Claude
 *
 * Existing labels are never overwritten.
 */
import { writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { classifyEmail } from "../src/index";
import { FIXTURES, type Label, loadSet, mapLimit, readLabels } from "./corpus";

const useModel = process.argv.includes("--yes");
const samples = await loadSet("private");
if (samples.length === 0) {
  console.log("No .eml files in packages/mail/fixtures/private/ yet.");
  process.exit(0);
}
const labels = await readLabels("private");
const fresh = samples.filter((s) => !labels[s.file]);
const client = useModel ? new Anthropic() : null;

await mapLimit(fresh, 4, async (s) => {
  const label: Label = {
    relevant: s.prefilter.relevant,
    category: s.prefilter.relevant ? "TODO" : "other",
    interviewKind: null,
    company: null,
    position: null,
  };
  if (client && s.prefilter.relevant) {
    const { classification: c } = await classifyEmail(client, {
      from: s.original.from,
      subject: s.original.subject,
      sentAt: s.original.sentAt,
      body: s.original.body,
      forwardedBy: s.original.forwardedBy,
    });
    Object.assign(label, {
      category: c.category,
      interviewKind: c.interviewKind,
      company: c.company,
      position: c.position,
    });
  }
  labels[s.file] = label;
});

const sorted = Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(new URL("private/labels.json", FIXTURES), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(
  `Added ${fresh.length} labels (${samples.length} emails total). Now review labels.json by hand:`,
);
console.log("every prefilled value is a guess until you've checked it.");
