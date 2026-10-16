# Architecture

## Principles

1. **Zero-entry by default.** Email is the main input. Manual entry is for gaps and
   corrections.
2. **History, not state.** Applications store an append-only event log, and everything
   else is derived from it (see [DATA_MODEL.md](DATA_MODEL.md)).
3. **Never silently wrong.** Automation only acts when the sender is verified, the
   classifier is highly certain, and exactly one application matches. Everything else
   goes to review, and every automated change can be undone.
4. **Minimum data.** Only mail the user's filter forwards reaches us. Raw mail is
   deleted on a timer (see [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md)).
5. **One brain.** Domain logic lives in a pure package with no I/O. The Worker and the
   web app are thin edges around it.

## System overview

```
 Job seeker's mailbox (Gmail · Outlook · iCloud · …)
        │  provider rule: forward job-related mail
        ▼
 Cloudflare Email Routing   (catch-all  *@in.<domain>)
        │
        ▼
 ┌─────────────────────────── Worker (one deployment) ───────────────────────────┐
 │ email()      receive → raw MIME to R2 → messages row → enqueue                 │
 │ queue()      parse/unwrap → verify → prefilter → classify → match → write      │──► Anthropic API
 │ fetch()      Hono REST API  +  serves the SPA's static assets                  │
 │ scheduled()  purge expired raw mail · weekly digest                            │
 └──────────────────┬──────────────────────────────────┬─────────────────────────┘
                    ▼                                  ▼
              D1 (SQLite)                        R2 (raw .eml, expires)
   users · applications · events
   messages · mail_sources · settings
                    ▲
                    │  JSON over HTTPS (session cookie)
             React SPA (browser)
```

The email path is asynchronous. `email()` does the minimum work (store, record,
enqueue) and returns, which keeps it within Workers CPU limits on large messages. The
queue consumer does the slow parts with retries and a dead-letter queue.

## Repo layout

```
apptracker/
├── packages/
│   ├── core/      Pure domain. No I/O and no runtime dependencies. Event types,
│   │              transition rules, derivations (status, ghosting), analytics,
│   │              Sankey builder, matcher scoring.
│   └── mail/      Email understanding. MIME → normalized message, forward unwrapping,
│                  sender verification, prefilter rules, ATS sender list, classifier
│                  prompt + zod schema, fixtures + eval runner. Depends on core.
├── apps/
│   ├── worker/    Cloudflare Worker: Hono API, email/queue/cron handlers, Drizzle
│   │              schema + migrations, auth, user-scoped repositories.
│   │              Depends on core + mail.
│   └── web/       React + Vite SPA. Depends on core (shared types only).
├── docs/
└── pnpm-workspace.yaml
```

### Dependency rules (enforce in CI)

```
apps/web ─────────────► packages/core ◄──── packages/mail
                              ▲                    ▲
apps/worker ──────────────────┴────────────────────┘
```

- `core` imports nothing from the workspace and has no runtime dependencies. It is fully
  unit-testable.
- `mail` has the prompt, schema and parsing. It takes an Anthropic client as a parameter
  instead of creating one, so evals can run it outside the Worker.
- `web` talks to `worker` only over HTTP and never imports `mail` or Worker internals.
- All database access goes through `apps/worker/src/repo/*`. Every function there takes
  `userId` as a required argument (see the scoping rule in
  [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md)).

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language across web, API and domain. First-class SDKs for Anthropic, Google and Microsoft. Allows a browser extension later. |
| Runtime/hosting | Cloudflare Workers + static assets | **Receiving email is the core of the product, and Cloudflare is the only mainstream platform where it is first-class and free** (Email Routing → Email Worker). Queues, cron, the database and object storage live in the same place and on one bill. Workers Paid costs $5/month. |
| Inbound email | Email Routing catch-all → Email Worker | A single catch-all rule covers every user address, which avoids Email Routing's 200-address limit. Max message size is 25 MiB. |
| MIME parsing | `postal-mime` | Works in the Workers runtime. |
| Database | D1 (SQLite) + Drizzle ORM | Each user's data is small (hundreds of applications). Relational data and the event log fit SQLite well. Typed migrations. |
| Raw mail storage | R2 with lifecycle expiry | Keeps large blobs out of D1. Expiry enforces the retention policy. |
| Async work | Cloudflare Queues | Retries, batching, dead-letter queue. |
| API | Hono | Small, typed, built for Workers. |
| Auth | Better Auth | Magic link, Google and Microsoft sign-in (passkeys later). Runs on Workers with D1. *(Confirmed in spike S4.)* |
| Transactional email | Cloudflare Email Service (fallback: Resend) | Magic links and digests. Same platform. |
| LLM | Anthropic API via `@anthropic-ai/sdk` | Structured outputs with zod (`messages.parse` + `zodOutputFormat`). Model choice in [EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#model-and-cost). |
| Frontend | React + Vite, TanStack Query, wouter, plain CSS with design tokens, lucide icons, self-hosted Archivo | Mainstream and simple. A single-page app with no server rendering is enough for v1. Visual system: [apps/web/DESIGN.md](../apps/web/DESIGN.md). |
| Charts | `d3-sankey` → SVG → PNG export | Same node and link data as the SankeyMATIC text export. |
| Tests | Vitest (+ Workers pool), `.eml` fixture corpus | Core logic is pure, so most tests are plain unit tests. |
| Tooling | pnpm workspaces, Biome, GitHub Actions, Wrangler | |

### Considered and rejected
- **.NET + CLI + Avalonia (the previous design):** a local desktop app can't receive
  email, and a CLI doesn't reach job seekers. Nothing in a web-first product calls for
  .NET.
- **Next.js on Vercel + Postgres:** perfectly viable, but receiving email would need a
  third vendor (Postmark, SES, Mailgun) plus glue code. Revisit if D1 limits bite (10 GB
  per database; raw mail lives in R2, so this is far away).
- **Direct Gmail/Outlook API access in v1:** best user experience, but Gmail read access
  is a "restricted scope." It requires a yearly third-party security assessment (CASA)
  once you have more than 100 users. Planned for M7 (see [EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#ingestion-paths)).

## API surface (v1)

All routes are under `/api` and require a session unless marked otherwise.
Responses include derived state computed by `core`, so the client never re-derives it.

| Method & path | Purpose |
|---|---|
| `GET /health` · `GET /config` | Public. Liveness, and which sign-in providers and features are enabled |
| `/auth/*` | Public. Better Auth (magic link, Google, Microsoft) |
| `GET /me` | The signed-in user |
| `GET /applications?status=&stage=&q=` | List with derived status, stage, age and ghost flag |
| `POST /applications` | Manual create (also appends an `applied` event) |
| `GET /applications/:id` | Static facts + full event timeline with evidence |
| `PATCH /applications/:id` | Edit static facts (company, position, url…) |
| `DELETE /applications/:id` | Hard delete, e.g. a duplicate created from a bad email |
| `POST /applications/:id/seen` · `POST /applications/seen` | Clear the "new" markers on one application, or all |
| `POST /applications/:id/events` | Append `advanced` / `closed` / `noted` (validated by `core`) |
| `POST /events/:id/void` | Undo: appends a `voided` event |
| `GET /review` | Messages with status `needs_review`, with suggested actions |
| `POST /review/:messageId` | Resolve: `confirm` / `assign {applicationId}` / `create` / `ignore` |
| `GET /stats?since=` | Funnel, rates, median time to first response |
| `GET /sankey?since=&labels=` | `{ nodes, links, sankeymatic }`. `labels` is JSON renaming built-in nodes, e.g. `{"no_response":"Ghosted"}`; nodes with the same label merge |
| `GET /mail-sources` · `POST /mail-sources/forwarding` · `POST /mail-sources/:id/rotate` | Forwarding address lifecycle and status |
| `PATCH /mail-sources/:id` | Set or clear the verified forwarding mailbox |
| `GET /messages?status=&limit=` | Recent emails and what the pipeline did with them (never bodies) |
| `POST /messages/upload` | Upload `.eml` files (backfill, Yahoo free accounts, testing) |
| `GET /settings` · `PATCH /settings` | Ghost threshold, time zone, raw-mail retention, automatic updates |
| `GET /account/export` | Everything stored about the user as a JSON download (no raw email) |
| `DELETE /account` | Body `{"confirm":"delete my account"}`. Deletes raw mail, then the user row, which cascades to everything else |

Outside the API, the Worker also handles inbound email (`email()`), the classification
queue (`queue()`) and a daily retention job (`scheduled()`, 03:17 UTC) that purges expired
raw mail and week-old filtered-out records.

## Environments

| Env | How |
|---|---|
| Local | `wrangler dev` with local D1/R2/Queues. `pnpm mail:send <file.eml> <address>` delivers a file through the same code path as `email()`. |
| Staging | Separate Worker, D1 and R2, on the `in-staging.<domain>` subdomain. Used for the author's real forwarding during development. |
| Production | Created at M6. |

## Running costs (early)

| Item | Cost |
|---|---|
| Workers Paid (includes D1/R2/Queues allowances at small scale) | $5 / month |
| Domain | ~$10–15 / year |
| LLM classification | Per relevant email, set by the model choice. See [EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#model-and-cost). |
| Later: CASA assessment for the Gmail connector | Reported ~$540–1k / year at the cheap end |
