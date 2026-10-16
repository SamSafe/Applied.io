import { Check, Inbox, Pencil, RefreshCw, Upload } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import type { InboxMessage, MailSource, UploadResult } from "../api";
import { ago } from "../format";
import {
  useConfig,
  useCreateForwarding,
  useMailSources,
  useMessages,
  useRotateForwarding,
  useSetVerifiedMailbox,
  useUpload,
} from "../hooks";
import { CopyButton, ErrorBanner } from "./bits";
import { Section } from "./Section";

/** Paste into Gmail's "Has the words" filter field (docs/EMAIL_PIPELINE.md recipe). */
export const GMAIL_FILTER =
  'from:(greenhouse.io OR greenhouse-mail.io OR lever.co OR myworkday.com OR ashbyhq.com OR icims.com OR smartrecruiters.com OR jobvite.com OR workablemail.com OR bamboohr.com OR jobs-noreply@linkedin.com OR indeedapply@indeed.com) OR subject:("your application" OR "thank you for applying" OR "thanks for applying" OR "application received" OR interview OR "next steps" OR "update on your application")';

const OUTLOOK_SENDERS =
  "greenhouse; lever.co; myworkday; ashbyhq; icims; smartrecruiters; jobvite; linkedin.com";
const OUTLOOK_SUBJECTS = "application; applying; interview";

export function ForwardingSection() {
  const sources = useMailSources();
  const create = useCreateForwarding();
  const forwarding =
    sources.data?.filter((s) => s.kind === "forwarding" && s.status !== "revoked") ?? [];

  return (
    <Section
      id="forwarding"
      title="Forwarding address"
      lede="Forward job emails here, or point an email filter at it, and Applied keeps your pipeline up to date."
    >
      {sources.error && <ErrorBanner error={sources.error} onRetry={() => sources.refetch()} />}
      {forwarding.map((s) => (
        <div key={s.id} className="stack stack-lg">
          <ForwardingAddress source={s} />
          <ForwardingMailbox source={s} />
          <SetupGuide source={s} />
        </div>
      ))}
      {sources.data && forwarding.length === 0 && (
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            <Inbox />
            Get my forwarding address
          </button>
        </div>
      )}
    </Section>
  );
}

function ForwardingAddress({ source }: { source: MailSource }) {
  const rotate = useRotateForwarding();
  const [confirming, setConfirming] = useState(false);
  if (!source.address) return null;

  return (
    <div className="stack">
      <div className="address">
        <code>{source.address}</code>
        <CopyButton text={source.address} />
      </div>
      <span className="status-note">
        {source.status === "active" && source.lastMessageAt ? (
          <>
            <Check width={15} height={15} aria-hidden="true" />
            Receiving · last email {ago(source.lastMessageAt)}
          </>
        ) : (
          "Waiting for the first email"
        )}
      </span>
      {confirming ? (
        <div className="confirm" role="alert">
          <p>
            Mail sent to the current address will be rejected. Update your email filter afterwards.
          </p>
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-small btn-danger-solid"
            disabled={rotate.isPending}
            onClick={() => rotate.mutate(source.id, { onSuccess: () => setConfirming(false) })}
          >
            Replace address
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-small" onClick={() => setConfirming(true)}>
            <RefreshCw />
            Get a new address
          </button>
        </div>
      )}
      {rotate.error && <ErrorBanner error={rotate.error} />}
    </div>
  );
}

/** The mailbox that forwards here. Only mail that provably comes through it is trusted. */
function ForwardingMailbox({ source }: { source: MailSource }) {
  const save = useSetVerifiedMailbox();
  const [editing, setEditing] = useState(false);
  const fromGmail =
    source.confirmation?.mailbox === source.verifiedMailbox && source.verifiedMailbox !== null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("mailbox") ?? "").trim();
    save.mutate({ id: source.id, mailbox: value || null }, { onSuccess: () => setEditing(false) });
  };

  if (source.verifiedMailbox && !editing) {
    return (
      <div className="mailbox-line">
        <span>
          Forwarding from <strong>{source.verifiedMailbox}</strong>
          <span className="field-hint"> · {fromGmail ? "confirmed by Gmail" : "set by you"}</span>
        </span>
        <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(true)}>
          <Pencil />
          Change
        </button>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor={`mailbox-${source.id}`}>
          The address you forward from
        </label>
        <span className="field-hint">
          Applied only acts on its own on emails that provably came through this mailbox. Gmail
          fills it in for you when you confirm the forwarding address.
        </span>
      </div>
      <div className="inline-form">
        <input
          className="input"
          id={`mailbox-${source.id}`}
          name="mailbox"
          type="email"
          placeholder="you@example.com"
          defaultValue={source.verifiedMailbox ?? ""}
          style={{ maxWidth: 300 }}
        />
        <button type="submit" className="btn" disabled={save.isPending}>
          Save
        </button>
        {editing && (
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
      {save.error && <ErrorBanner error={save.error} />}
    </form>
  );
}

type Provider = "gmail" | "outlook" | "other";

function SetupGuide({ source }: { source: MailSource }) {
  const initial: Provider =
    source.providerHint === "outlook"
      ? "outlook"
      : source.providerHint && source.providerHint !== "gmail"
        ? "other"
        : "gmail";
  const [provider, setProvider] = useState<Provider>(initial);
  const address = source.address ?? "";

  return (
    <div className="setup">
      <div className="setup-head">
        <h3 className="section-title">Set up forwarding</h3>
        <div className="segmented" role="tablist" aria-label="Your email provider">
          {(["gmail", "outlook", "other"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              className="segment"
              onClick={() => setProvider(p)}
            >
              {p === "gmail" ? "Gmail" : p === "outlook" ? "Outlook" : "Other"}
            </button>
          ))}
        </div>
      </div>

      {provider === "gmail" && (
        <ol className="steps" role="tabpanel">
          <li>
            In Gmail, open <b>Settings → See all settings → Forwarding and POP/IMAP</b>, choose{" "}
            <b>Add a forwarding address</b>, and paste your Applied address.
          </li>
          <li>
            Gmail sends a confirmation code to Applied. It shows up here:
            {source.confirmation ? (
              <div className="code-card">
                <span className="code-value num">{source.confirmation.code}</span>
                <CopyButton text={source.confirmation.code} label="Copy code" />
              </div>
            ) : (
              <p className="field-hint waiting">Waiting for Gmail's confirmation email…</p>
            )}
            Enter it in Gmail and choose <b>Verify</b>. Leave forwarding itself off; the filter does
            the work.
          </li>
          <li>
            Under <b>Filters and Blocked Addresses</b>, choose <b>Create a new filter</b>, paste
            this into <b>Has the words</b>, then <b>Create filter</b> and tick{" "}
            <b>Forward it to {address}</b>:
            <Recipe text={GMAIL_FILTER} />
          </li>
        </ol>
      )}

      {provider === "outlook" && (
        <ol className="steps" role="tabpanel">
          <li>
            In Outlook, open <b>Settings → Mail → Rules</b> and choose <b>Add new rule</b>.
          </li>
          <li>
            Add the condition <b>From</b> contains, with these entries:
            <Recipe text={OUTLOOK_SENDERS} />
          </li>
          <li>
            Choose the action <b>Redirect to</b> (not "Forward to", so the original sender is kept)
            and enter {address}. Save the rule.
          </li>
          <li>
            Add a second rule the same way with <b>Subject includes</b>:
            <Recipe text={OUTLOOK_SUBJECTS} />
          </li>
          <li className="field-hint">
            Work or school accounts (Microsoft 365) sometimes block forwarding outside the
            organization. If nothing arrives, forward emails by hand or upload them below.
          </li>
        </ol>
      )}

      {provider === "other" && (
        <ol className="steps" role="tabpanel">
          <li>
            Create a rule or filter that forwards (or, better, redirects) job emails to {address}.
            iCloud, Fastmail, Proton and most others have one under Settings → Rules or Filters.
          </li>
          <li>Any email can also be forwarded by hand. That always works.</li>
          <li className="field-hint">
            Yahoo Mail's free plan can't forward automatically. Forward emails one by one, or
            download them and upload them below.
          </li>
        </ol>
      )}
    </div>
  );
}

function Recipe({ text }: { text: string }) {
  return (
    <div className="recipe">
      <code>{text}</code>
      <CopyButton text={text} />
    </div>
  );
}

const STATUS_LABEL: Record<InboxMessage["status"], string> = {
  received: "Waiting",
  filtered_out: "Filtered out",
  needs_review: "Needs review",
  applied: "Applied",
  ignored: "Ignored",
  failed: "Failed",
};

const CATEGORY_LABEL: Record<string, string> = {
  application_received: "Application received",
  assessment: "Assessment",
  interview_invite: "Interview invite",
  interview_logistics: "Interview details",
  rejection: "Rejection",
  offer: "Offer",
  withdrawal_ack: "Withdrawal confirmed",
  recruiter_outreach: "Recruiter outreach",
  other: "Not job-related",
};

/** What the pipeline did with the latest emails, and a way to upload saved .eml files. */
export function RecentEmailsSection() {
  const messages = useMessages();
  const config = useConfig();
  const upload = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const classifierOn = config.data?.classifier ?? true;

  return (
    <Section
      id="recent-emails"
      title="Recent emails"
      lede="What happened to the latest emails that reached Applied. Bodies are never shown here."
    >
      <div className="inline-form">
        <input
          ref={fileRef}
          type="file"
          accept=".eml,message/rfc822"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length)
              upload.mutate(files, { onSuccess: ({ results }) => setResults(results) });
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <Upload />
          {upload.isPending ? "Uploading…" : "Upload .eml files"}
        </button>
        {results && <span className="status-note">{summarize(results)}</span>}
      </div>
      {upload.error && <ErrorBanner error={upload.error} />}
      {!classifierOn && (
        <p className="field-hint">
          Classification is turned off in this environment, so relevant emails wait unclassified.
        </p>
      )}
      {messages.error && <ErrorBanner error={messages.error} onRetry={() => messages.refetch()} />}
      {messages.data && messages.data.length === 0 && (
        <p className="field-hint">
          Nothing yet. Emails appear here a few seconds after they arrive.
        </p>
      )}
      {messages.data && messages.data.length > 0 && (
        <ul className="inbox-list">
          {messages.data.map((m) => (
            <li key={m.id} className="inbox-row">
              <div className="inbox-top">
                <span className="inbox-subject">{m.subject || "(no subject)"}</span>
                <span className="inbox-when num">{ago(m.receivedAt)}</span>
              </div>
              <div className="inbox-meta">
                <span className={`status-text${m.status === "failed" ? " is-failed" : ""}`}>
                  {STATUS_LABEL[m.status]}
                </span>
                {m.from && <span className="inbox-from">{m.from}</span>}
              </div>
              <p className="inbox-detail">{detail(m, classifierOn)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function detail(m: InboxMessage, classifierOn: boolean): string {
  if (m.status === "failed") return m.failure ?? "Processing failed.";
  if (m.status === "filtered_out")
    return `Not a job email${m.filterReason ? ` (${m.filterReason})` : ""}.`;
  if (m.status === "ignored") return "Gmail's forwarding confirmation.";
  if (m.status === "received") return classifierOn ? "Processing…" : "Not classified yet.";
  const what = m.category ? (CATEGORY_LABEL[m.category] ?? m.category) : "Classified";
  const where = [m.company, m.position].filter(Boolean).join(", ");
  return `${what}${where ? ` · ${where}` : ""}${m.senderVerified ? "" : " · sender not verified"}`;
}

function summarize(results: UploadResult[]): string {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const parts = [
    counts.queued && `${counts.queued} added`,
    counts.duplicate && `${counts.duplicate} already received`,
    counts.too_large && `${counts.too_large} too large`,
    counts.invalid && `${counts.invalid} not emails`,
  ].filter(Boolean);
  return parts.join(" · ");
}
