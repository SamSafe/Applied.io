import { domainOf, type ParsedEmail } from "./parse";
import type { Unwrapped } from "./unwrap";

export interface GmailConfirmation {
  code: string;
  mailbox: string;
}

/**
 * Gmail asks the destination to confirm a new forwarding address by emailing it a code.
 * That email also tells us which mailbox is doing the forwarding.
 */
export function detectGmailConfirmation(email: ParsedEmail): GmailConfirmation | null {
  if (email.from?.address !== "forwarding-noreply@google.com") return null;
  const haystack = `${email.subject ?? ""}\n${email.text ?? ""}`;
  if (!/forwarding confirmation/i.test(haystack)) return null;
  const code =
    /#(\d{6,})/.exec(haystack)?.[1] ?? /confirmation code:\s*(\d{6,})/i.exec(haystack)?.[1];
  const mailbox = /receive mail from\s+([^\s)]+@[^\s)]+)/i.exec(haystack)?.[1];
  return code && mailbox ? { code, mailbox: mailbox.toLowerCase() } : null;
}

export interface SenderCheck {
  verified: boolean;
  reason: string;
}

/**
 * Did this message provably come through the user's own mailbox? Only verified mail can be
 * applied automatically (docs/EMAIL_PIPELINE.md, step 3). Provisional: spike S1 will confirm
 * which headers each provider preserves.
 */
export function verifySender(
  email: ParsedEmail,
  unwrapped: Pick<Unwrapped, "wrapper" | "forwardedBy">,
  verifiedMailbox: string | null,
): SenderCheck {
  if (!verifiedMailbox) return { verified: false, reason: "no verified forwarding mailbox yet" };
  const mailbox = verifiedMailbox.toLowerCase();

  const forwardedFor = header(email, "x-forwarded-for").join(" ").toLowerCase();
  if (forwardedFor.split(/\s+/).includes(mailbox)) {
    return { verified: true, reason: "auto-forwarded by the verified mailbox" };
  }

  if (unwrapped.wrapper !== "none" && unwrapped.forwardedBy?.address === mailbox) {
    if (authPassed(email, domainOf(mailbox))) {
      return { verified: true, reason: "forwarded by hand from the verified mailbox (DKIM pass)" };
    }
    return { verified: false, reason: "forwarder matches but authentication didn't pass" };
  }

  return { verified: false, reason: "not forwarded by the verified mailbox" };
}

export type ProviderHint = "gmail" | "outlook" | "icloud" | "proton" | "yahoo";

/** Best guess at the forwarding provider, for onboarding copy and the S1 spike. */
export function detectProvider(email: ParsedEmail): ProviderHint | null {
  const domains = header(email, "dkim-signature").flatMap(
    (v) => /\bd=([^;\s]+)/.exec(v)?.[1] ?? [],
  );
  const has = (...ds: string[]) => domains.some((d) => ds.includes(d.toLowerCase()));
  if (header(email, "x-forwarded-for").length > 0 || has("gmail.com", "googlemail.com"))
    return "gmail";
  if (
    has("outlook.com", "hotmail.com", "live.com") ||
    email.headers.some((h) => h.key.startsWith("x-ms-exchange"))
  ) {
    return "outlook";
  }
  if (has("icloud.com", "me.com", "mac.com")) return "icloud";
  if (has("proton.me", "protonmail.com", "pm.me")) return "proton";
  if (has("yahoo.com", "ymail.com")) return "yahoo";
  return null;
}

function header(email: ParsedEmail, key: string): string[] {
  return email.headers.filter((h) => h.key === key).map((h) => h.value);
}

function authPassed(email: ParsedEmail, domain: string): boolean {
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dkim = new RegExp(`dkim=pass[^;]*header\\.(d|i)=@?${escaped}\\b`, "i");
  const dmarc = new RegExp(`dmarc=pass[^;]*header\\.from=${escaped}\\b`, "i");
  return header(email, "authentication-results").some((v) => dkim.test(v) || dmarc.test(v));
}
