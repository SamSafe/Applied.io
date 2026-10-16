# Product

## Problem

Job seekers send dozens to hundreds of applications. Greenhouse reports about 254
applicants per posting, and LinkedIn sees roughly 11,000 applications a minute. Tracking
them is manual: copy each job into a spreadsheet, Notion or a tracker app, then update
its status by hand. Most people stop updating within weeks. After that they lose track
of who replied, when to follow up, and what's actually working.

The evidence is already in their inbox. Applicant tracking systems (Greenhouse, Lever,
Workday, Ashby, iCIMS…) send a confirmation for nearly every application and an email
for most status changes. Nobody should have to retype what their inbox already knows.

## Who it's for

- **Primary:** active job seekers sending 20+ applications, mostly roles hired through an
  applicant tracking system (tech and white-collar), where confirmation and rejection
  emails are standard.
- **First user:** the author, during their own current search.
- **Not for:** recruiters or employers.

## Value proposition

> **Apply anywhere. Your tracker updates itself.**

1. **Zero-entry capture.** Applications and status changes are created from email, with
   no typing and no browser extension required.
2. **Honest status.** Ghosting is computed from silence, not guessed or forgotten.
3. **Insight you can share.** Funnel stats and the Reddit-style Sankey are built from
   real data, with one-click PNG export.

## Non-goals (deliberate)

| Not building | Why |
|---|---|
| **Auto-apply / mass apply** | Crowded (LazyApply, JobCopilot, AIApply, Jobright…) with poor reputations. It conflicts with LinkedIn's terms, which ban bot access. It worsens the "AI doom loop" the Greenhouse CEO describes, where identical AI applications flood recruiters and employers respond with AI filters. And it doesn't get people hired. |
| **Autofill** | Simplify's Copilot does it for free, with 500k+ Chrome users. |
| **Resume tailoring, job discovery** | Crowded, and unrelated to the core problem. |
| **Reading the whole inbox (v1)** | Trust and compliance cost. Forwarding only sends us what the user's filter selects. |

## Competition

| Product | Approach | Where we differ |
|---|---|---|
| Spreadsheet / Notion + SankeyMATIC | Manual entry, chart by hand | This is the default we replace |
| Simplify | Free autofill extension and tracker | Its tracker only fills for applications made through its extension |
| Applybase | Free tracker with Sankey charts, manual entry | We capture automatically |
| JobTrackerAI (Wonsulting), ApplyTrack | Connect your Gmail account | We work with any provider and don't need inbox-wide access |
| JobShinobi, JobSnap | Forward emails, AI extracts the status | **Closest competitors.** We differentiate on accuracy, review and undo, and insight |
| n8n / Sheets templates | DIY Gmail → spreadsheet | Only for technical users |

**Honest read:** the idea isn't new, so this is an execution play. Where we aim to win:

1. **Any provider on day one.** Forwarding works anywhere rules exist.
2. **Never silently wrong.** Sender verification, certainty gates, a review queue, and
   one-click undo.
3. **The chart is built in.** It's the product's share loop.
4. **Minimum data.** Short retention, and nothing used for training.

## Is it worth doing?

**Yes, for this scope.** It solves the author's own problem within weeks, and the
personal MVP (M0–M5) is about 22 focused days. It reaches real users through an open
gap: provider-agnostic, trustworthy auto-tracking. Even if it never earns money, it's a
strong portfolio piece covering email infrastructure, LLM classification with evals,
and an event-sourced domain.

**Business reality:** money is hard here. Job seekers won't pay much, they stop using
the tool once hired, and there are free alternatives. See the business model below.

## Business model

**Users never pay for the AI.** Classification with Claude Haiku 5.5 costs about $0.0005
per email, or roughly $0.19 for a whole job search (see
[EMAIL_PIPELINE.md](EMAIL_PIPELINE.md#model-and-cost)). The free tier absorbs that as
marketing spend.

| Tier | Includes | Price | When |
|---|---|---|---|
| **Free** | Forwarding, auto-tracking, review queue, stats, follow-up reminders, Sankey + sharing | $0 | From M5 |
| **Search Pass** | One-click Gmail/Outlook connection with 90-day history import, deeper insights and benchmarks | One-time, around $15 for 3 months (price to be validated) | Only if the M6 pricing test shows demand |
| **Institutions** (later) | Career centers, bootcamps, coaches and outplacement firms paying for groups of job seekers | TBD | After M8. Needs consent design. |

Rules:
- **Sharing stays free.** Every shared Sankey is an ad, so it's the growth engine.
- **A pass, not a subscription.** Job searches last a few months and then end, so a
  subscription gets resented and cancelled.
- **The paid tier is convenience with real costs behind it.** Connectors need a yearly
  Google security assessment and Microsoft publisher verification.
- **The free tier is limited only by abuse caps** (the daily classification limit), not
  by features or application count. The Sankey looks best with lots of data.
- **No ads, no selling data.** Either would contradict the privacy pitch.
- **No "bring your own key" in the hosted app.** Chat subscriptions (Claude Pro, ChatGPT
  Plus) don't include API access, and asking job seekers for an API key is too much
  friction for about $0.19 of value. Bring-your-own-key only makes sense for
  self-hosters, if the project is open-sourced (decided at M6).
- **Validate before building.** M6 adds a pricing page with an Upgrade button before any
  paid feature exists. If enough beta users click, build M7 and payments. If not, stay
  free and keep costs minimal.

## Success metrics

| Stage | Metric | Target |
|---|---|---|
| Personal MVP (M5) | Events captured with zero typing | ≥ 80% |
| | Precision of auto-applied events | ≥ 97% |
| | Author stops using Notion | yes |
| Public beta (M6) | Outside users onboarded on ≥ 2 providers without help | 10 |
| | Relevant emails that need review | ≤ 10% |
| | Week-4 retention among users still searching | track |
| | Users who export or share a Sankey | track |
| Growth (M8) | Share-page views → signups | track |

## Name

"Applied.io" is a working name. **Check before public beta:** "Applied" is also the name
of an existing hiring platform (beapplied.com), so trademark and domain conflicts are
likely.

## Sources
- [Greenhouse CEO on the "AI doom loop" (Fortune via Yahoo, 2026-07-27)](https://finance.yahoo.com/small-business/articles/greenhouse-ceo-says-job-seekers-070200061.html)
- [LinkedIn CEO on application volume (Fortune, 2026-09-30)](https://fortune.com/2026/09/30/linkedin-ceo-dan-shapero-says-job-seekers-sending-out-30-more-applications-pre-pandemic-harder-know-who-can-do-job/)
- [Auto-apply tools compared (NoxJobs)](https://noxjobs.com/compare/best-ai-auto-apply-tools-ranked-honest-comparison-2026)
- [Which auto-apply bots actually submit (FastApply, vendor test)](https://blog.fastapply.co/ai-job-application-bots-which-actually-submit-2026)
- [Simplify review](https://resumly.ai/answers/simplify-jobs-review) · [Simplify Copilot help](https://help.simplify.jobs/articles/3296996-using-copilot-to-autofill-applications)
- [JobShinobi forwarding](https://jobshinobi.com/landing/job-tracking-with-gmail-forwarding) · [ApplyTrack Gmail](https://mintlify.com/philtechphilips/applytrack/integrations/gmail) · [Applybase](https://hunted.space/product/applybase)
