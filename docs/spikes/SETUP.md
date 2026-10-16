# Staging setup (for spikes S1–S3)

One-time steps to put the Worker on a real domain so it can receive forwarded email.
Commands run from `apps/worker/`. Budget about 30–45 minutes, plus DNS propagation.

## 1. Domain and Cloudflare account
1. Buy a domain on Cloudflare Registrar, or point an existing domain's nameservers at
   Cloudflare.
2. Upgrade to **Workers Paid** ($5/month). Queues and comfortable CPU limits for email
   need it.
3. Log in: `pnpm exec wrangler login`

## 2. Create the staging resources
```sh
pnpm exec wrangler d1 create apptracker-staging
pnpm exec wrangler r2 bucket create apptracker-staging-raw-mail
pnpm exec wrangler queues create apptracker-staging-mail
pnpm exec wrangler queues create apptracker-staging-mail-dlq
# Backstop for the daily purge job: nothing outlives the 30-day maximum retention.
pnpm exec wrangler r2 bucket lifecycle add apptracker-staging-raw-mail expire-raw-mail --expire-days 31
```
In `wrangler.jsonc` → `env.staging`, replace:
- `REPLACE_WITH_D1_ID` with the `database_id` printed by `d1 create`
- `REPLACE_WITH_DOMAIN` with your domain (the inbound domain becomes `in-staging.<domain>`)
- `REPLACE_WITH_SUBDOMAIN` with your workers.dev subdomain (shown in the dashboard under
  Workers & Pages)

Set the auth secret, apply migrations, then build and deploy:
```sh
node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))' \
  | pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler d1 migrations apply DB --remote --env staging
pnpm --filter @apptracker/web build && pnpm deploy:staging
```

## 3. Route inbound mail to the Worker
Dashboard → your domain → **Email** → **Email Routing**:
1. Enable Email Routing for the subdomain `in-staging.<domain>`. Cloudflare adds the MX
   and TXT records. (If your plan doesn't offer subdomain routing, use the apex domain and
   set `INBOUND_DOMAIN` to match.)
2. **Routing rules → Catch-all address → Send to a Worker → `apptracker-staging`.**

## 4. Sign in and get a forwarding address
Magic links aren't emailed yet (M2). On staging they're written to the Worker log:
```sh
pnpm exec wrangler tail --env staging            # leave running in one terminal
```
In another terminal (set `B` to your staging URL):
```sh
B=https://apptracker-staging.<subdomain>.workers.dev
curl -X POST "$B/api/auth/sign-in/magic-link" -H "origin: $B" \
  -H 'content-type: application/json' -d '{"email":"you@example.com","callbackURL":"/"}'
# copy the [magic-link] URL from the tail output, then:
curl -c jar.txt "<magic link URL>" -o /dev/null
curl -b jar.txt -X POST -H "origin: $B" "$B/api/mail-sources/forwarding"
# → {"source":{"address":"u_xxxxxxxxxx@in-staging.<domain>", ...}}
```

## 5. Run the spikes
Keep `wrangler tail --env staging` running. Each received email logs a line starting with
`{"spike":"S1"`.

- **S2 – Gmail:** Settings → Forwarding and POP/IMAP → *Add a forwarding address* → your
  `u_…` address. Google's confirmation email arrives as an S1 line, and its subject
  contains the confirmation code. Enter the code in Gmail.
- **S1 – Gmail:** create a filter (EMAIL_PIPELINE.md has the recipe) with "Forward it
  to" your address. Then forward 3–5 real job emails *manually* too, since filters only
  catch new mail. Repeat from iCloud (Rules → Forward to) and Proton if you have them.
- **S3 – Outlook.com:** Settings → Mail → Rules → new rule → *Redirect to* your
  address. Send yourself a test that matches the rule. Then try *Forward to* and note
  the difference. Try a Microsoft 365 work account if you have one.

For each provider, paste the S1 line (redact personal addresses) into
[README.md](README.md) under its spike, with notes on anything surprising: missing
headers, wrapping, delays, rejections.
