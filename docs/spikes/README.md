# M0 spikes

Spikes retire the riskiest assumptions before the onboarding copy and the email pipeline
get built on them (see [ROADMAP.md → M0](../ROADMAP.md#m0--foundations--spikes-3-days)).
Each spike records its findings here.

| Spike | Question | Status |
|---|---|---|
| S1 – Inbound and headers | Which original headers survive forwarding from Gmail, Outlook.com, iCloud (and Proton), and how is each forward wrapped? | **Waiting on the domain.** Logging is built: the queue consumer prints a `{"spike":"S1",…}` header report on staging. |
| S2 – Gmail confirmation | Does Gmail's forwarding confirmation reach our inbox, and can we read the code? | **Waiting on the domain.** |
| S3 – Outlook rules | Can Outlook.com (and Microsoft 365) redirect or forward to an external address, and in what format? | **Waiting on the domain.** |
| S4 – Auth | Does Better Auth run on Workers + D1? | **Done for magic links.** Google and Microsoft sign-in are wired but untested until OAuth client IDs exist. |

To run S1–S3, follow [SETUP.md](SETUP.md).

## S4 findings (2026-10-16)

- Better Auth 1.7.10 with the Drizzle adapter (`provider: "sqlite"`) runs on Workers + D1
  without changes. One instance is created per request because bindings only exist per
  request.
- Magic-link sign-in works end to end, both in the Workers-runtime tests
  (`apps/worker/test/api.test.ts`) and against `wrangler dev`. The steps are: request link
  → verify (302 + session cookie) → `GET /api/me`.
- The auth tables follow Better Auth's model (`user`, `session`, `account`,
  `verification`) with snake_case columns. The field list was taken from
  `@better-auth/core`'s `getAuthTables()` for 1.7.10. Re-check it when upgrading.
- POST requests need an `Origin` header matching `BETTER_AUTH_URL`, which is Better Auth's
  CSRF check. Browsers send it automatically. Scripts must set it.
- Still open: Google and Microsoft OAuth. Create client IDs and set the
  `GOOGLE_CLIENT_*` / `MICROSOFT_CLIENT_*` secrets. Microsoft uses `tenantId: "common"`
  so personal and work accounts can both sign in.

## S1 findings
_Not run yet._

## S2 findings
_Not run yet._

## S3 findings
_Not run yet._
