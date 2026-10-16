# Roadmap

Each milestone can be demoed on its own. Estimates are **focused days for one developer**
and are rough. At evenings-and-weekends pace, multiply calendar time by about 3.

- **Personal MVP = M0–M5 (~22 days).** You stop using Notion and get your real Sankey.
- **Public beta = M6.**
- **Direct connectors = M7**, only once the beta shows pull.

M2 already replaces Notion for new applications, so the tool is useful partway through
your search, not only at the end.

---

## M0 — Foundations & spikes (~3 days)

Retire the riskiest assumptions first. Each spike produces a short note in `docs/spikes/`.

- [ ] **S1 – Inbound and headers.** Buy the domain on Cloudflare, set up an Email Routing
      catch-all on `in-staging.<domain>` → a Worker that logs headers. Forward real job
      emails from Gmail, Outlook.com and iCloud (and Proton if available). Record which
      original headers survive (From, Date, Message-ID, `X-Forwarded-For`, ARC/DKIM
      results) and what each wrapper looks like.
- [ ] **S2 – Gmail confirmation.** Add the staging address as a Gmail forwarding
      address. Confirm the confirmation email arrives and the code can be extracted.
- [ ] **S3 – Outlook rules.** Check whether Outlook.com allows Redirect/Forward to an
      external address, whether there's throttling, and the format. Check a Microsoft
      365 tenant if one is available.
- [x] **S4 – Auth.** Better Auth on Workers + D1: magic link verified; Google/Microsoft wired,
      untested until OAuth client IDs exist (see [spikes/README.md](spikes/README.md)).

Scaffold:
- [x] pnpm workspace: `packages/core`, `packages/mail`, `apps/worker`, `apps/web`. TS
      strict, Biome, Vitest.
- [x] `wrangler.jsonc` with D1, R2 and Queue bindings, plus a staging env (production
      comes at M6).
- [x] Drizzle schema for every table in [DATA_MODEL.md](DATA_MODEL.md) + first migration.
- [x] Replace `.gitignore` with Node/Wrangler rules (`node_modules/`, `dist/`,
      `.wrangler/`, `.dev.vars`, `packages/mail/fixtures/private/`).
- [x] GitHub Actions: typecheck, lint, test, dependency-rule check.

**Done when:** a job email forwarded from your real Gmail lands as a row in staging D1,
and the S1–S4 notes answer every **Spike** row in
[EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#provider-setup-matrix).

## M1 — Core domain (~3 days)

Pure TypeScript in `packages/core`, no I/O.
- [x] Types: `Stage`, `Outcome`, the `Event` union, `Application`.
- [x] `validate(events, proposedEvent)` → ok or a typed violation.
- [x] `derive(app, now, settings)` → live events, `appliedAt`, `maxStage`, status,
      `lastActivityAt`, `isStale`, time to first response.
- [x] `analytics(apps, now, settings, range)` → funnel, rates, median time to first response.
- [x] `sankey(apps, now, settings)` → path builder (monotonic rule, terminal nodes),
      edge counts, SankeyMATIC text, `{nodes, links}`.
- [x] `match(apps, extracted, intent)` → decision, plus `findRepeatedEvent` for dedupe.
      Includes company/title normalizers.
- [x] Table-driven tests: the DATA_MODEL worked example verbatim, voids, reopen after a
      voided close, interview rounds, out-of-order events, ghost boundaries. (Core works on
      UTC instants; time zones only affect display, in M2.)

**Done when:** every example in DATA_MODEL.md and every row of the EMAIL_PIPELINE
matching table is a passing test.

## M2 — Manual tracker (~4 days)

- [ ] Auth: magic link + Google + Microsoft sign-in. Session middleware.
- [ ] User-scoped repositories + cross-user access tests.
- [ ] API: applications, events, void, settings (see
      [ARCHITECTURE.md](ARCHITECTURE.md#api-surface-v1)).
- [ ] Web: sign-in, application list (stage, status, age, ghost flag, filters, search),
      detail timeline with actions (advance / reject / withdraw / accept / decline /
      note / undo), add form.
- [ ] Deploy to staging.

**Done when:** you log new applications here instead of Notion.

## M3 — Email: receive → understand (~5 days)

- [x] Forwarding address: issue and rotate, `mail_source` status (API only; UI in this
      milestone).
- [ ] Onboarding screen: Gmail steps, filter recipe with a copy button, live "waiting for
      first email…" check, Gmail confirmation code display.
- [x] `email()`: reject unknown addresses, size cap, drop duplicates by Message-ID,
      store to R2, insert row, enqueue.
- [ ] Parser: `postal-mime`, forward unwrapping (Gmail, Outlook, rfc822 attachment),
      HTML → text, quote/signature stripping.
- [ ] Sender verification v1 (from S1 findings).
- [ ] Prefilter + seed ATS sender list.
- [ ] Classifier: prompt + zod schema + `messages.parse`. Store the classification,
      version and model.
- [ ] `POST /messages/upload` for `.eml` files.
- [ ] Eval: export ≥ 100 of your own job emails into `fixtures/private/`, label them,
      `pnpm eval` runner. Redacted public subset in CI.
- [ ] Run the eval on `claude-haiku-5-5` (the chosen model). If it misses the targets,
      fix the prompt first, then try a larger model (see
      [EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#model-and-cost)).

**Done when:** on your corpus, category accuracy ≥ 95% and company extraction ≥ 90%.

## M4 — Email: match → act (~4 days)

- [ ] Matching + decision table + dedupe rules. Create/append/link in a single D1 batch.
- [ ] Auto-apply gate.
- [ ] Review queue API + UI (confirm / pick another / create / ignore).
- [ ] Timeline: "from email" badge, evidence quote, one-click undo.
- [ ] Reliability: retries, dead-letter queue, `failed` status with the reason shown,
      per-user daily cap.

**Done when:** across two weeks of your real search, ≥ 80% of events arrive with zero
typing, auto-applied precision is ≥ 97%, and review is ≤ 10% of relevant emails.

## M5 — Insight & share (~3 days)

- [ ] Stats page from `core.analytics`.
- [ ] Sankey view (`d3-sankey`), date-range filter, renameable labels.
- [ ] Export PNG (with a small "made with Applied" mark), copy SankeyMATIC text.
- [ ] Ghost threshold + time zone settings.

**Done when:** your real data produces a Sankey you'd post.

---

## M6 — Public beta (~5 days)

- [ ] Onboarding guides for Outlook.com, iCloud, Microsoft 365, Yahoo (manual/upload)
      and generic providers. Detect the provider from the first forwarded email.
- [ ] Privacy policy, terms, subprocessors. Export + account deletion. Purge job
      verified (see [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md#compliance-checklist)).
- [ ] Abuse and cost controls: rate limits, per-user LLM budget, spend alert.
- [ ] Error tracking + admin view (counts and failure reasons only).
- [ ] Landing page, invite codes, feedback link.
- [ ] Weekly digest + follow-up nudges ("10 days since your interview at X").
- [ ] Name and domain conflict check.
- [ ] **Pricing test:** a pricing page with the Search Pass (see
      [PRODUCT.md](PRODUCT.md#business-model)) and an Upgrade button, live before any
      paid feature exists. Record views → clicks, and email clickers when it ships.

**Done when:** 10 outside users are onboarded on ≥ 2 providers without your help, and
the pricing test gives a go/no-go for M7.

## M7 — Direct connectors (~6–8 days + verification lead time)

Only if the M6 pricing test says go. This becomes the Search Pass.

- [ ] Payments through a merchant of record (e.g. Paddle) so global sales tax is
      handled for you. One-time Search Pass with entitlement checks on paid routes.
- [ ] Gmail API connector in testing mode (≤ 100 users): OAuth, incremental sync
      (polling `history.list` via cron first; Pub/Sub push later), 90-day backfill
      classified via the Batch API.
- [ ] Microsoft Graph connector: OAuth (personal + work), delta-query sync, backfill.
- [ ] Encrypted token storage, disconnect/revoke.
- [ ] Start Google verification + CASA Tier 2 and Microsoft publisher verification
      **as soon as M6 shows traction**. These take weeks.

**Done when:** a Gmail or Outlook user connects in one click and sees the last 90 days of
applications reconstructed.

## M8 — Growth (open-ended)
- [ ] Public share pages: count snapshots, social preview image, revocable.
- [ ] Opt-in anonymized benchmarks: response rate by ATS, role family, time to response.
- [ ] Browser extension: one-click "save this posting" for applications that send no
      confirmation.
- [ ] Ghost-job signals (repost detection).

Deferred: mobile app, CLI via API token, IMAP.

---

## Risks

| Risk | Impact | Mitigation | Retired by |
|---|---|---|---|
| Providers forward in inconsistent formats or strip headers | Matching and verification break | Spikes S1/S3 before any onboarding copy | M0 |
| Outlook personal accounts restrict external forwarding | Second-biggest provider unsupported in v1 | S3. Fallback: manual forward + prioritize the Graph connector | M0 |
| Classifier accuracy below target | Users see wrong statuses | Eval gate, certainty gate, review queue, undo | M3–M4 |
| Ambiguous matches (several roles at one company) | Review queue floods | Title + ATS job ref + req number scoring | M4 |
| LLM cost per user too high for free | No sustainable free tier | Haiku 5.5 (~$0.19 per user per search), prefilter, caps, Batch API for backfill | M3 |
| Users won't trust inbox access | Low conversion | Forwarding-only v1, short retention, clear privacy page | M6 |
| Nobody will pay | No revenue | The free tier costs ~$0.19 per user per search. Pricing test before building anything paid. | M6 |
| Your time while job hunting | Project stalls | M2 is useful on its own. Personal MVP scoped to ~22 days. | ongoing |
| Name conflict with beapplied.com | Forced rebrand | Check before M6 | M6 |

## Open decisions (owner)
1. **Online assessments as their own stage** (DATA_MODEL open decision 1), after you
   have real data.
2. **Product name and domain**, before M6.
3. **Open-source or not** (and the license), at M6. Open-sourcing builds trust for an app
   that reads email and lets self-hosters bring their own API key.

Decided: the classifier model is `claude-haiku-5-5` (2026-10-15).
