# Applied.io (working name)

**Apply anywhere. Your tracker updates itself.**

A job-application tracker that fills itself in from your email. The "thanks for
applying" email creates the application, interview and rejection emails move it through
the pipeline, silence marks it ghosted, and the Sankey chart people post on Reddit comes
for free.

Works with any email provider from day one: you add a forwarding rule in Gmail, Outlook,
iCloud and so on, and job-related mail goes to your private Applied address. Direct
Gmail/Outlook connections come later.

## The ideas to understand first
1. **Status is a history, not a field.** Each application stores an append-only log of
   events. Current status, ghosting, stats and the Sankey are all *derived* from it.
   See [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
2. **Never silently wrong.** Every email-driven change is either high-confidence and
   undoable, or it waits in a review queue. See [docs/EMAIL_PIPELINE.md](docs/EMAIL_PIPELINE.md).
3. **Minimum data.** We only see mail the user's own filter forwards, and raw email is
   deleted after 30 days. See [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md).

## Documentation
| Doc | What it covers |
|-----|----------------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Problem, users, competition, non-goals, whether it's worth doing |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, repo layout, stack and rationale, API surface |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables, event log, transition rules, derivations, Sankey algorithm |
| [docs/EMAIL_PIPELINE.md](docs/EMAIL_PIPELINE.md) | Provider setup, parsing, classification, matching, review queue, evals |
| [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md) | What we store, threats, retention, compliance checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones M0–M8 with tasks, estimates, done-when, risks |

## Stack
TypeScript · Cloudflare Workers (Email Routing, Queues, D1, R2) · Hono · Drizzle ·
Better Auth · React + Vite · Anthropic API (email classification)

## Development
Requires Node 22 and pnpm (`corepack enable`).
```sh
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars    # then set BETTER_AUTH_SECRET
pnpm --filter @apptracker/worker db:migrate:local
pnpm --filter @apptracker/web build                       # the Worker serves the SPA build
pnpm --filter @apptracker/worker dev                      # http://localhost:8787
pnpm mail:send packages/mail/fixtures/public/gmail-autoforward-greenhouse.eml <address>
pnpm run check                                            # lint, dependency rules, types, tests
```
Locally, magic-link sign-in URLs are printed to the `wrangler dev` console. Staging setup
is in [docs/spikes/SETUP.md](docs/spikes/SETUP.md).

## Status
M0 is built except the spikes that need a real domain (S1–S3). M1 (core domain) is done.
See [ROADMAP.md](docs/ROADMAP.md) and [docs/spikes/](docs/spikes/README.md). The earlier
.NET CLI/desktop design and the Java prototype are in git history.
