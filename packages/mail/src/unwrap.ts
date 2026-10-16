import { type Mailbox, type ParsedEmail, parseAddress, parseEmail, toIso } from "./parse";
import { htmlToText } from "./text";

export type Wrapper = "none" | "inline" | "attachment";

/** The email as its original sender wrote it, recovered from any forwarding wrapper. */
export interface Unwrapped {
  wrapper: Wrapper;
  from: Mailbox | null;
  subject: string | null;
  sentAt: string | null;
  /** Plain-text body of the original message (uncleaned). */
  body: string;
  /** Whoever forwarded it by hand, when it was wrapped; null for auto-forwards. */
  forwardedBy: Mailbox | null;
}

const MARKERS = [
  /^-{5,}\s*Forwarded message\s*-{5,}\s*$/im, // Gmail and most web clients
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im, // older Outlook
  /^Begin forwarded message:\s*$/im, // Apple Mail
  /^_{10,}\s*$/m, // Outlook desktop and web
];

const HEADER_LINE = /^\s*\*?(From|Sent|Date|Subject|To|Cc|Reply-To)\*?:\s*(.*)$/i;

export async function unwrap(email: ParsedEmail): Promise<Unwrapped> {
  const body = bodyText(email);

  if (email.forwardedRaw !== null) {
    const inner = await parseEmail(email.forwardedRaw);
    return {
      wrapper: "attachment",
      from: inner.from,
      subject: inner.subject,
      sentAt: inner.sentAt ?? email.sentAt,
      body: bodyText(inner),
      forwardedBy: email.from,
    };
  }

  const inline = findInlineForward(body);
  if (inline) {
    return {
      wrapper: "inline",
      from: inline.from ?? email.from,
      subject: inline.subject ?? stripForwardPrefix(email.subject),
      sentAt: inline.sentAt ?? email.sentAt,
      body: inline.body,
      forwardedBy: email.from,
    };
  }

  return {
    wrapper: "none",
    from: email.from,
    subject: email.subject,
    sentAt: email.sentAt,
    body,
    forwardedBy: null,
  };
}

function bodyText(email: ParsedEmail): string {
  if (email.text?.trim()) return email.text;
  return email.html ? htmlToText(email.html) : "";
}

interface InlineForward {
  from: Mailbox | null;
  subject: string | null;
  sentAt: string | null;
  body: string;
}

/** Finds a forwarded header block (From / Date or Sent / Subject) and the body after it. */
function findInlineForward(text: string): InlineForward | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  for (const marker of MARKERS) {
    const match = marker.exec(normalized);
    if (!match) continue;
    const parsed = parseHeaderBlock(normalized.slice(match.index + match[0].length));
    if (parsed) return parsed;
  }
  return null;
}

function parseHeaderBlock(rest: string): InlineForward | null {
  const lines = rest.replace(/^\n+/, "").split("\n");
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line.trim()) break;
    const m = HEADER_LINE.exec(line);
    if (!m) {
      if (i === 0) return null; // the marker isn't followed by a header block
      continue; // a wrapped header value; ignore the continuation
    }
    headers[(m[1] as string).toLowerCase()] = (m[2] as string).trim();
  }
  if (!headers.from) return null;
  return {
    from: parseAddress(headers.from),
    subject: headers.subject || null,
    sentAt: parseLooseDate(headers.date ?? headers.sent),
    body: lines.slice(i + 1).join("\n"),
  };
}

/** Forwarded dates come in client-specific shapes, e.g. "Mon, Oct 12, 2026 at 4:30 PM". */
export function parseLooseDate(value: string | undefined): string | null {
  if (!value) return null;
  return toIso(value.replace(/\s+at\s+/i, " ").replace(/\s+/g, " "));
}

function stripForwardPrefix(subject: string | null): string | null {
  return subject ? subject.replace(/^\s*((fwd?|fw)\s*:\s*)+/i, "") : null;
}
