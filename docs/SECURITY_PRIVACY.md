# Security & Privacy

People are trusting us with their email, so trust is the product. The rules: collect
the minimum, keep it briefly, show the user what we have, let them delete it, never sell
it, never use it for training.

## What we store

| Data | Where | Retention |
|---|---|---|
| Raw MIME of **relevant** forwarded mail | R2 | Deleted after `raw_retention_days` (default 30) by R2 lifecycle + a daily purge job. Long enough for review and reprocessing. |
| **Filtered-out** forwarded mail | — | Body never stored past the prefilter. Headers (from, subject, date) kept 7 days for debugging. |
| Extracted facts: company, position, dates, events, evidence quote (≤ 300 chars) | D1 | Until the user deletes them or their account |
| Account: email, name, auth records | D1 (Better Auth) | Until account deletion |
| OAuth tokens (M7 connectors) | D1, encrypted with AES-GCM (key in Workers secrets) | Until disconnect or deletion |

## Third parties (subprocessors)

| Who | What they get |
|---|---|
| Cloudflare | Hosting, database, storage, receiving and sending email |
| Anthropic | Text of relevant emails, for classification only |
| Transactional email provider (if not Cloudflare) | Recipient address + magic link or digest content |

Before public beta, check Anthropic's current API data-retention and training terms and
state them accurately in the privacy policy.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| **Forwarding address leaks → fake emails injected** (e.g. a fake offer) | Sender verification. Unverified mail is never auto-applied and goes to review. Users can rotate the address. |
| **Prompt injection in email bodies** | The classifier has no tools and its output must match the schema. The prompt treats the body as data. The worst case is a wrong *suggestion*, which is limited by the auto-apply gate, review and undo. |
| **One user seeing another's data** | D1 has no row-level security, so all access goes through repository functions that take a required `userId`. Every query filters on it, and there are tests per repository for cross-user access. No raw SQL in route handlers. |
| **Account takeover** | Better Auth with OAuth / magic link (passkeys later). HttpOnly, Secure, SameSite=Lax cookies. CSRF protection on mutations. Short magic-link expiry. |
| **Spam to the catch-all address** | Unknown local parts are rejected at the mail server. Per-address rate limits and size caps. |
| **LLM cost abuse** | Prefilter, per-user daily classification cap, alert on spend. |
| **Secrets in the repo** | Workers secrets / `.dev.vars` (gitignored). Secret scanning in CI. |
| **Personal email in test fixtures** | `fixtures/private/` is gitignored. Only redacted or synthetic fixtures are committed. |
| **Admin snooping** | The admin view shows counts and failure reasons, never email content. Content access for debugging requires the user's explicit consent per message. |

## User rights (built by M6)
- **Export:** JSON (everything) + CSV (applications and events).
- **Delete a message:** removes the raw object and the evidence quote. Events stay
  unless the user voids them.
- **Delete the account:** hard-deletes all D1 rows and R2 objects within 24 hours and
  revokes forwarding addresses and connector tokens.
- **Disable auto-apply:** everything goes through review instead.

## Public share pages (M8)
A share stores a **snapshot of aggregate counts** and an optional title. No company
names unless the user opts in per share. Revocable at any time.

## Compliance checklist

**Before public beta (M6):**
- [ ] Privacy policy, terms, subprocessor list, contact address
- [ ] Working export and deletion flows
- [ ] Raw-mail purge job verified
- [ ] Product name and domain checked for conflicts (see [PRODUCT.md](PRODUCT.md#name))

**Before the Gmail connector leaves testing mode (M7):**
- [ ] Google OAuth verification and the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) Limited Use requirements
- [ ] CASA Tier 2 assessment, renewed yearly
- [ ] Microsoft publisher verification for the Graph connector

**If there are EU/UK users:** a lawful basis (contract), data processing agreements with
subprocessors, and a documented response process for data-subject requests.
