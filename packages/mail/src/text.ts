/** The most body text a classifier ever sees. Job emails say what matters early. */
export const MAX_BODY_CHARS = 8000;

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

/** Plain text from an HTML body: block elements become line breaks, everything else goes. */
export function htmlToText(html: string): string {
  return tidy(
    html
      .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|tr|h[1-6]|table|section|article|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, name: string) => {
        if (name.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
        if (/^#\d+$/.test(name) && name !== "#39")
          return String.fromCodePoint(Number(name.slice(1)));
        return ENTITIES[name.toLowerCase()] ?? match;
      }),
  );
}

const FOOTER_LINE =
  /unsubscribe|manage (your )?(email )?preferences|privacy (policy|notice)|you('| a)re receiving this|do not reply to this|this (e-?mail|message) (was|is) (sent|intended)|view (this email )?in (your )?browser/i;

/**
 * Removes what never helps classification: quoted replies, signatures, footers, and long
 * tracking links (kept as their hostname). Truncates to MAX_BODY_CHARS.
 */
export function cleanBody(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^-- ?$/.test(line)) break; // signature delimiter
    if (kept.some((l) => l.trim()) && /^On .{4,200} wrote:\s*$/.test(line.trim())) break;
    if (/^\s*>/.test(line)) continue;
    if (FOOTER_LINE.test(line) && line.length < 240) continue;
    kept.push(line.replace(/https?:\/\/\S{40,}/g, (url) => `[link: ${hostname(url)}]`));
  }
  const cleaned = tidy(kept.join("\n"));
  return cleaned.length > MAX_BODY_CHARS ? `${cleaned.slice(0, MAX_BODY_CHARS)}…` : cleaned;
}

function tidy(text: string): string {
  return text
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
