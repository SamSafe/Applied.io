const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "llp",
  "lp",
  "sa",
  "ag",
  "bv",
  "nv",
  "pty",
  "srl",
  "oy",
  "ab",
]);

const TITLE_ABBREVIATIONS: Record<string, string[]> = {
  sr: ["senior"],
  snr: ["senior"],
  jr: ["junior"],
  swe: ["software", "engineer"],
  sde: ["software", "engineer"],
  eng: ["engineer"],
  engr: ["engineer"],
  mgr: ["manager"],
  dev: ["developer"],
  pm: ["product", "manager"],
  ml: ["machine", "learning"],
  ai: ["artificial", "intelligence"],
  qa: ["quality", "assurance"],
  ux: ["user", "experience"],
  ui: ["user", "interface"],
  vp: ["vice", "president"],
  i: ["1"],
  ii: ["2"],
  iii: ["3"],
  iv: ["4"],
};

const TITLE_NOISE = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "for",
  "to",
  "in",
  "at",
  "remote",
  "hybrid",
  "onsite",
  "fulltime",
  "parttime",
  "contract",
]);

function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(?:[a-z]\.){2,}/g, (dotted) => dotted.replace(/\./g, "")) // "s.a." → "sa"
    .replace(/&/g, " and ")
    .replace(/full[\s-]time/g, "fulltime")
    .replace(/part[\s-]time/g, "parttime")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** "Stripe, Inc." and "STRIPE" both become "stripe". */
export function normalizeCompany(name: string): string {
  const tokens = words(name);
  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1] as string)) tokens.pop();
  return tokens.join(" ");
}

/** "Sr. SWE (Remote)" becomes "senior software engineer". */
export function normalizeTitle(title: string): string {
  return titleTokens(title).join(" ");
}

function titleTokens(title: string): string[] {
  return words(title)
    .flatMap((w) => TITLE_ABBREVIATIONS[w] ?? [w])
    .filter((w) => !TITLE_NOISE.has(w));
}

/** Jaccard similarity of normalized title tokens, from 0 (disjoint) to 1 (same words). */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Requisition numbers compare case- and punctuation-insensitively ("R-1234" = "r1234"). */
export function normalizeReqNumber(req: string): string {
  return req.toLowerCase().replace(/[^a-z0-9]/g, "");
}
