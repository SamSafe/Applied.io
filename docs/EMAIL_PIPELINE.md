# Email Pipeline

**Goal:** every job-related email the user receives becomes the right application or
event automatically, or lands in a short review queue. It is never silently wrong.

## Ingestion paths

| Path | Providers | Phase | What we can see | Notes |
|---|---|---|---|---|
| **Forwarding address** | Any provider with forwarding rules | v1 (M3) | Only what the user's filter forwards | Works everywhere. No Google or Microsoft verification needed. |
| **`.eml` upload / manual forward** | Any | v1 | One message at a time | For backfill, free Yahoo accounts, and testing |
| Gmail API connector | Gmail, Google Workspace | M7 | Read access (restricted scope) | One-click setup + history backfill. Free in Google's "testing" mode for up to 100 users, whose sign-in expires weekly. Past that it needs Google verification + a CASA Tier 2 assessment (reported ~$540–1k/year, weeks of lead time). |
| Microsoft Graph connector | Outlook.com, Hotmail, Microsoft 365 | M7 | `Mail.Read` | Needs Microsoft publisher verification for personal accounts. Work tenants may require admin consent. *(Verify in M7.)* |
| IMAP with app password | Yahoo, iCloud, Fastmail | Not planned | Whole mailbox | Storing mailbox passwords is a liability. Only if demand proves it. |

## Forwarding address

- Each user gets `u_<10 random chars>@in.<domain>` and can rotate it at any time (the
  old address stops working).
- Cloudflare Email Routing: one **catch-all** rule on `in.<domain>` → Email Worker.
- Unknown local parts are rejected at the mail-server level, so the sender gets a bounce
  and we store nothing.

### Provider setup matrix

Rows marked **Spike** are unverified assumptions that M0 must confirm before the
onboarding copy is written.

| Provider | Setup | Can filter? | Caveats | Status |
|---|---|---|---|---|
| **Gmail** | Settings → Forwarding → add our address. Gmail sends a confirmation email *to us*; we detect it and show the code in onboarding. Then create a filter with the recipe below → "Forward it to". | Yes (search query) | Filters only apply to **new** mail, so backfill needs `.eml` upload or the M7 connector. | Known flow; S2 confirms it end to end |
| **Outlook.com / Hotmail** | Settings → Mail → Rules → condition (sender/subject contains…) → **Redirect to** (keeps the original sender; preferred over "Forward to") | Yes, fewer OR terms per rule → provide 2–3 rules | Check that personal accounts allow external redirect and what headers survive | **Spike S3** |
| **Microsoft 365 (work/school)** | Same rules | Yes | Organizations often block external auto-forwarding by policy. Fallback: manual forward or the M7 Graph connector. | **Spike S3** |
| **iCloud Mail** | iCloud.com → Mail → Settings → Rules → "Forward to" | Partial (sender/subject) | | **Spike S1** |
| **Yahoo Mail** | Free accounts can't auto-forward (removed January 2021; paid plans only) | — | Fall back to manual forward or `.eml` upload | Known |
| **Proton Mail** | Auto-forward on paid plans; filters via Sieve | Yes | End-to-end encrypted. Check what arrives. | **Spike S1** |
| **Others** (Fastmail, Zoho, GMX…) | Generic "forward/redirect rule" instructions | Usually | | — |

**Gmail filter recipe** (shown in onboarding with a copy button; the sender list is a
seed to check against the fixture corpus):
```
from:(greenhouse.io OR greenhouse-mail.io OR lever.co OR myworkday.com OR ashbyhq.com
OR icims.com OR smartrecruiters.com OR jobvite.com OR workablemail.com OR bamboohr.com)
OR subject:("your application" OR "thank you for applying" OR "thanks for applying"
OR "application received" OR interview OR "next steps" OR "update on your application")
```
The provider filter should be generous; the prefilter (step 4) removes noise on our side.

## Pipeline

```
email()  ─►  1 receive ─► [queue] ─► 2 parse & unwrap ─► 3 verify sender ─► 4 prefilter
                                                                               │ relevant
                       8 write ◄── 7 decide ◄── 6 match ◄── 5 classify ◄───────┘
```

1. **Receive** (`email()`, must be fast):
   - Look up the address token. Unknown → reject.
   - Enforce a size cap (we cap at 5 MB; the platform allows 25 MiB).
   - Drop duplicates by `Message-ID`.
   - Store the raw MIME in R2, insert a `message` row (`received`), enqueue its id.
2. **Parse & unwrap** (queue consumer):
   - Parse with `postal-mime`.
   - If the message is a wrapper (`Fwd:`/`FW:` subject, `message/rfc822` attachment,
     Gmail's "---------- Forwarded message ---------" block, Outlook's
     "From: … Sent: …" block), recover the original From, Date, Subject and body.
   - Convert HTML to text, strip quoted replies, signatures and tracking links.
   - Truncate to about 8k characters.
   - Special case: a Gmail forwarding confirmation (from `forwarding-noreply@google.com`)
     → record `verified_mailbox`, surface the code in onboarding, don't classify.
3. **Verify sender:** did this come through the user's own mailbox? Signals:
   - the forwarding hop's DKIM/ARC results (`Authentication-Results`)
   - provider headers such as Gmail's `X-Forwarded-For`
   - a match against `verified_mailbox`

   Unverified messages are **never auto-applied**; they go to review. This blocks anyone
   who learns the address from injecting fake offers or rejections.
4. **Prefilter** (deterministic, no LLM, saves money and limits exposure):
   - Relevant if the sender is a known ATS domain **or** a keyword score passes a
     threshold.
   - Known noise is dropped: job alerts ("jobs you may like"), newsletters, marketing.
   - Filtered-out mail: body discarded immediately, headers kept 7 days so "why didn't X
     show up?" can be answered.
5. **Classify & extract:** one Claude call with structured output (schema below).
6. **Match** to an application (pure `core` function, unit-tested).
7. **Decide:** auto-apply or send to review (gate below).
8. **Write:** create the application if needed, append the event, link the message, in
   one D1 batch. Then notify the user, either right away or in a digest.

Failures retry with backoff. After the last retry the message is marked `failed` with
the reason shown to the user, and it goes to the dead-letter queue.

## Classification schema

```ts
// packages/mail/src/classify/schema.ts
export const Classification = z.object({
  jobRelated: z.boolean(),
  category: z.enum([
    "application_received", // "thanks for applying"
    "assessment",           // online assessment / take-home invite
    "interview_invite",     // asks to schedule a call or interview (any round)
    "interview_logistics",  // confirmations, reminders, reschedules, calendar invites
    "rejection",
    "offer",
    "withdrawal_ack",       // confirms the candidate withdrew
    "recruiter_outreach",   // inbound sourcing, not tied to an application
    "other",                // alerts, newsletters, anything else
  ]),
  interviewKind: z.enum(["recruiter_screen", "interview", "final_round"]).nullable(),
  company: z.string().nullable(),
  position: z.string().nullable(),
  reqNumber: z.string().nullable(),
  location: z.string().nullable(),
  certainty: z.enum(["high", "medium", "low"]),
  evidence: z.string(), // verbatim quote that justifies `category`; truncated to 300 chars in code
});
```

Called with `client.messages.parse({ …, output_config: { format: zodOutputFormat(Classification) } })`.
The system prompt says the email body is **untrusted data to classify, not
instructions**. The call has no tools.

### Category → event

| Category | Event | Notes |
|---|---|---|
| `application_received` | `applied` (creates the application) | `appliedAt` = original sent date |
| `assessment` | `advanced(screen)` | v1 mapping (see the DATA_MODEL open decision) |
| `interview_invite` + `recruiter_screen` | `advanced(screen)` | |
| `interview_invite` + `interview` | `advanced(interview)` | |
| `interview_invite` + `final_round` | `advanced(final)` | |
| `interview_logistics` | none | Attached as evidence to the latest event at that stage |
| `rejection` | `closed(rejected)` | |
| `offer` | `advanced(offer)` | Always notifies |
| `withdrawal_ack` | `closed(withdrawn)` | |
| `recruiter_outreach` | none | Future "leads" feature |
| `other` | none | Body discarded |

## Matching (`core.match`)

**Candidates:** the user's applications with the same `company_key`, `company_domain`
or ATS company slug (e.g. `boards.greenhouse.io/<slug>`). No company match means no
candidate.

**Scoring features:** exact `ats_job_ref` (strong), exact `req_number` (strong), title
similarity (token overlap on `position_key`), open versus closed, recency.

| Situation | Action |
|---|---|
| `application_received`, no matching open application | Create the application + `applied` |
| `application_received` that duplicates an open application (title similarity ≥ 0.8, within 30 days, or the same ATS job ref) | Attach as evidence, no new event |
| `application_received` with no position, and the company has an open application from the last 30 days | Review: a repeat confirmation and a second application look the same |
| Status email, exactly one open application at the company | Match. The position may be missing, since company-level rejections often omit it. If the email names a clearly different title (similarity < 0.25), send to review instead. |
| Status email, several open applications | Best title similarity ≥ 0.6 **and** ≥ 0.2 ahead of the next → match; otherwise review "which application?" |
| Status email, no application found | Review: "Create an application from this email?" |
| Email about a **closed** application (the only matches are closed, or a closed one beats every open one by ≥ 0.2) | Review (possible re-engagement) |
| Same stage as an event within the last 14 days | Attach as evidence, no new event (invite, confirmation and reminder all describe one step) |

## Decide: the auto-apply gate

An event is applied automatically **only if all** of these hold:
- the sender is verified
- certainty is `high`
- the match is unambiguous (or it's a create)
- it passes `core.validate`
- the user has `auto_apply` on

Otherwise it goes to review. Every automated event shows an "from email" badge with the
evidence quote and a one-click **Undo**, which appends a `voided` event.

## Review queue

One card per message: suggested action, evidence quote, sender and date, and buttons
**Confirm / Pick another application / Create new / Ignore**. Resolving a card writes the
event exactly like the automatic path. Target: at most 10% of relevant emails need review.

## Model and cost

- **Model:** `claude-haiku-5-5` (owner's decision, 2026-10-15) with
  `output_config.effort: "low"`. Classification doesn't need deep reasoning, and Haiku
  5.5 defaults to `medium` effort, so set it explicitly.
- **Assumptions:** about 3k input tokens (system prompt + schema + truncated email) and
  about 400 output tokens per relevant email. An active search is ~150 applications ×
  ~2.5 relevant emails ≈ **375 classified emails per user per search**.

| Model | $ per M tokens (input / output) | ≈ per email | ≈ per user per search |
|---|---|---|---|
| `claude-haiku-5-5` (chosen) | $0.10 / $0.50 | ~$0.0005 | ~$0.19 |
| `claude-opus-5-5` (only if Haiku misses targets) | $4 / $20 | ~$0.02 | ~$7.50 |

At these rates, full searches for 1,000 users cost about $190 in classification. If
Haiku misses the M3 accuracy targets, fix the prompt first, then evaluate a larger model.

### Free alternatives considered

| Option | Cost | Why not (for now) |
|---|---|---|
| Rules only, no AI | $0 | Companies customize ATS email wording, so rules break when the text changes and miss free-form recruiter mail. High maintenance. The free part of the idea survives as the deterministic prefilter (step 4). |
| Open-weight model on Cloudflare Workers AI | Free up to 10,000 "neurons" a day per account, shared by all users. After that, third-party listings suggest a per-email cost similar to Haiku's. | The free allowance covers a personal tool but not a user base, and small open models are likely less accurate. Easy to add as an extra candidate in the M3 eval. Upside: data stays on Cloudflare. |
| Free tiers of hosted LLM APIs (e.g. Gemini) | $0 | Google's unpaid-tier terms let it use submitted content to improve its products, including human review. Not acceptable for other people's email. |
| Local model (e.g. Ollama) | $0 | Fine for experiments, but it can't serve a hosted app. |

Other cost levers:
- the prefilter, so only relevant mail reaches the model
- a per-user daily cap
- the Message Batches API (50% off, asynchronous) for backfill and imports, never for
  live mail
- prompt caching on the stable system prompt + schema prefix. Check that
  `usage.cache_read_input_tokens` is non-zero, since the minimum cacheable prefix
  depends on the model and our prefix may be too short.

## Accuracy and evals

- **Corpus:** `packages/mail/fixtures/private/` holds the author's own job emails as
  `.eml` plus `labels.json` (category, company, position, expected match). **It is
  gitignored, so personal mail never gets committed.** A small redacted or synthetic set
  in `fixtures/public/` runs in CI.
- **Target size:** ≥ 100 emails covering at least Greenhouse, Lever, Workday, Ashby,
  iCIMS, LinkedIn Easy Apply and direct company mail, across every category.
- **Metrics:** category accuracy, company/position extraction (normalized exact match),
  match accuracy, auto-apply precision (**target ≥ 97%**), review rate.
- **Runner:** `pnpm eval` prints a confusion matrix and the metrics, and records them by
  `classifier_version`. Prompt or model changes merge only if the metrics hold.
- **Reprocessing:** messages whose raw MIME is still within retention can be reclassified
  after a classifier upgrade.
