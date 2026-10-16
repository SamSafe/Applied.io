import PostalMime, { type Address, addressParser, decodeWords } from "postal-mime";

export interface Mailbox {
  name: string;
  address: string;
}

export interface ParsedEmail {
  from: Mailbox | null;
  subject: string | null;
  /** ISO-8601, or null when the Date header is missing or unparseable. */
  sentAt: string | null;
  messageId: string | null;
  /** All headers in order, keys lowercased. Repeated headers appear once per occurrence. */
  headers: { key: string; value: string }[];
  text: string | null;
  html: string | null;
  attachments: { filename: string | null; mimeType: string; size: number }[];
  /** Raw bytes of the first attached message (message/rfc822), for unwrapping forwards. */
  forwardedRaw: ArrayBuffer | Uint8Array | string | null;
}

export type RawEmail = ArrayBuffer | Uint8Array | string;

export async function parseEmail(raw: RawEmail): Promise<ParsedEmail> {
  // Keep forwarded messages as attachments so unwrapping can tell how they were forwarded.
  const email = await PostalMime.parse(raw, { rfc822Attachments: true });
  return {
    from: firstMailbox(email.from),
    subject: email.subject ?? null,
    sentAt: toIso(email.date),
    messageId: email.messageId ?? null,
    headers: email.headers.map((h) => ({ key: h.key, value: h.value })),
    text: email.text ?? null,
    html: email.html ?? null,
    forwardedRaw: email.attachments.find((a) => a.mimeType === "message/rfc822")?.content ?? null,
    attachments: email.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: typeof a.content === "string" ? a.content.length : a.content.byteLength,
    })),
  };
}

/** Parses a single address header such as `Acme <jobs@acme.com>`. */
export function parseAddress(header: string | null | undefined): Mailbox | null {
  if (!header) return null;
  return firstMailbox(addressParser(header, { flatten: true }));
}

/** Decodes RFC 2047 encoded words (`=?UTF-8?Q?...?=`) in a header value. */
export function decodeHeader(value: string | null | undefined): string | null {
  return value ? decodeWords(value) : null;
}

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

export function toIso(date: string | null | undefined): string | null {
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function firstMailbox(value: Address | Address[] | undefined): Mailbox | null {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  for (const a of list) {
    if (a.address) return { name: a.name, address: a.address.toLowerCase() };
    const member = a.group?.find((m) => m.address);
    if (member) return { name: member.name, address: member.address.toLowerCase() };
  }
  return null;
}
