import type { ParsedEmail } from "./parse";

/**
 * What a forwarded message looks like on arrival: which original headers survived the
 * forwarding hop and how the original was wrapped. Logged by spike S1 (docs/ROADMAP.md, M0)
 * to settle the provider setup matrix and to design unwrapping and sender verification.
 */
export interface HeaderReport {
  from: string | null;
  subject: string | null;
  sentAt: string | null;
  messageId: string | null;
  subjectForwardPrefix: boolean;
  /** Gmail-style auto-forward headers. */
  xForwardedFor: string | null;
  xForwardedTo: string | null;
  authenticationResults: string[];
  arcAuthenticationResults: string[];
  dkimDomains: string[];
  receivedHops: number;
  /** "inline" (quoted block in the body), "attachment" (message/rfc822), or "none". */
  wrapper: "inline" | "attachment" | "none";
  attachmentTypes: string[];
  headerKeys: string[];
}

const INLINE_FORWARD_MARKERS = [
  /-{5,}\s*Forwarded message\s*-{5,}/i, // Gmail, many web clients
  /^_{10,}\s*$\s*^From:.*$\s*^Sent:.*$/im, // Outlook
  /^Begin forwarded message:/im, // Apple Mail
];

export function headerReport(email: ParsedEmail): HeaderReport {
  const all = (key: string) => email.headers.filter((h) => h.key === key).map((h) => h.value);
  const one = (key: string) => all(key)[0] ?? null;
  const body = email.text ?? "";
  const attachmentTypes = email.attachments.map((a) => a.mimeType);

  return {
    from: email.from?.address ?? null,
    subject: email.subject,
    sentAt: email.sentAt,
    messageId: email.messageId,
    subjectForwardPrefix: /^\s*(fwd?|fw)\s*:/i.test(email.subject ?? ""),
    xForwardedFor: one("x-forwarded-for"),
    xForwardedTo: one("x-forwarded-to"),
    authenticationResults: all("authentication-results"),
    arcAuthenticationResults: all("arc-authentication-results"),
    dkimDomains: all("dkim-signature").flatMap((v) => /\bd=([^;\s]+)/.exec(v)?.[1] ?? []),
    receivedHops: all("received").length,
    wrapper: attachmentTypes.includes("message/rfc822")
      ? "attachment"
      : INLINE_FORWARD_MARKERS.some((re) => re.test(body))
        ? "inline"
        : "none",
    attachmentTypes,
    headerKeys: [...new Set(email.headers.map((h) => h.key))],
  };
}
