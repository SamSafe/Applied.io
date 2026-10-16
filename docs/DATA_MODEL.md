# Data Model

The central decision is unchanged: **status is a history, not a field.** Each application
stores an append-only log of events. Current status, ghosting, stats and the Sankey are
all derived from that log. This is also exactly the shape the email pipeline writes in:
"interview email arrived" means "append an event."

This revision fixes gaps in the earlier design:
- an explicit rule for turning events into Sankey nodes
- interview rounds no longer create loops
- a way to correct mistakes (void events)
- a node for applications still waiting on a first reply
- transition rules

## Entities

```
user ─┬─< mail_source                 (forwarding address; later Gmail/Graph connectors)
      ├─< message                     (one inbound email + what we understood from it)
      ├─< application ─< event >──○ message   (an event may cite the email that caused it)
      └── settings
```

Tables live in D1 (SQLite). IDs are ULIDs (sortable text). Timestamps are ISO-8601 UTC
text. Every table except Better Auth's own carries `user_id`, and every query filters
on it.

### `application`: static facts
| Column | Type | Notes |
|---|---|---|
| `id` | text | ULID |
| `user_id` | text | |
| `company` | text | Display name as the user or extractor wrote it |
| `company_key` | text | Normalized for matching: lowercase, strip punctuation and Inc/LLC/Ltd/GmbH |
| `company_domain` | text? | From the sender address or an ATS link, when known |
| `position` | text | Job title |
| `position_key` | text | Normalized title for matching |
| `req_number` | text? | Requisition number |
| `ats` | text? | `greenhouse`, `lever`, `workday`, `ashby`, `icims`, … |
| `ats_job_ref` | text? | ATS job id or slug parsed from links (strong match key) |
| `location` | text? | |
| `url` | text? | Posting link |
| `source` | text? | linkedin, referral, company site… |
| `notes` | text? | Freeform |
| `created_via` | text | `manual` \| `email` |
| `created_at` | text | |

There's no `applied_on` column. The applied date comes from the `applied` event so the
two can never disagree.

### `event`: one immutable fact about an application
| Column | Type | Notes |
|---|---|---|
| `id` | text | ULID |
| `application_id` | text | |
| `user_id` | text | Denormalized for scoping |
| `type` | text | `applied` \| `advanced` \| `closed` \| `noted` \| `voided` |
| `stage` | text? | `advanced` only: `screen` \| `interview` \| `final` \| `offer` |
| `outcome` | text? | `closed` only: `rejected` \| `withdrawn` \| `accepted` \| `declined` |
| `voids_event_id` | text? | `voided` only: the event being retracted |
| `occurred_at` | text | When it happened (the original email's sent date, or user-entered) |
| `recorded_at` | text | When we stored it |
| `origin` | text | `manual` \| `email` |
| `message_id` | text? | Evidence: the email that produced this event |
| `certainty` | text? | `high` \| `medium` \| `low` (email origin only) |
| `note` | text? | |

```ts
// packages/core: the event union (sketch)
type Stage = "applied" | "screen" | "interview" | "final" | "offer";   // ordered
type Outcome = "rejected" | "withdrawn" | "accepted" | "declined";

type Event = Base & (
  | { type: "applied" }
  | { type: "advanced"; stage: Exclude<Stage, "applied"> }
  | { type: "closed"; outcome: Outcome }
  | { type: "noted" }
  | { type: "voided"; voidsEventId: string }
);
```

**Append-only discipline.** Events are never updated or deleted. To correct a mistake,
append a `voided` event that points at the bad one. Derivations ignore voided events.
This makes every automated change undoable and auditable. The only hard delete is
deleting a whole application (duplicates, junk) or the whole account.

### `message`: one inbound email
| Column | Type | Notes |
|---|---|---|
| `id` | text | ULID |
| `user_id`, `source_id` | text | Which user and which forwarding address or connector |
| `received_at` | text | When it reached us |
| `raw_key` | text? | R2 object key. Set to null when purged. |
| `header_message_id` | text? | Original `Message-ID`, used to drop duplicates |
| `from_address`, `from_domain` | text | **Original** sender, after unwrapping the forward |
| `subject` | text | |
| `sent_at` | text | Original `Date`. Becomes `event.occurred_at`. |
| `sender_verified` | int | 1 if it provably came through the user's own mailbox |
| `status` | text | `received` → `filtered_out` \| `needs_review` \| `applied` \| `ignored` \| `failed` |
| `classification` | text? | JSON matching the classifier schema |
| `classifier_version`, `model` | text? | So we can reprocess when the classifier improves |
| `evidence` | text? | Quote of at most 300 chars that justified the classification |
| `application_id`, `event_id` | text? | What it produced or attached to |
| `review` | text? | JSON: suggested action + candidate applications |
| `failure` | text? | Last error, for `failed` |
| `purge_after` | text | When to delete the raw object |

### `mail_source`
| Column | Type | Notes |
|---|---|---|
| `id`, `user_id` | text | |
| `kind` | text | `forwarding` (v1) \| `gmail` \| `graph` (M7) |
| `address_token` | text? | Random local part, e.g. `u_7f3k9q2m4x` → `u_7f3k9q2m4x@in.<domain>` |
| `status` | text | `awaiting_first_mail` \| `active` \| `revoked` |
| `provider_hint` | text? | `gmail` / `outlook` / `icloud` / … detected from the first message |
| `verified_mailbox` | text? | The user's own address, seen in forwarding headers or Gmail's confirmation |
| `credentials` | text? | M7: encrypted OAuth tokens |
| `last_message_at`, `created_at` | text | |

### `settings`
`user_id`, `ghost_threshold_days` (default **21**), `timezone`, `raw_retention_days`
(default **30**), `auto_apply` (default on), `digest` (`off` \| `weekly`).

## Transition rules (`core.validate`)

Rules are evaluated against the application's live (non-voided) events.

| Proposed event | Allowed when | Otherwise |
|---|---|---|
| `applied` | It's the first event of a new application | Rejected (at most one) |
| `advanced(stage)` | Application is open | On a closed application: manual → error; email → review |
| `closed(rejected \| withdrawn)` | Application is open | Same as above |
| `closed(accepted \| declined)` | Open **and** `offer` has been reached | Manual → error; email → review |
| `noted` | Always | — |
| `voided(id)` | Target exists, isn't `applied`, and isn't already voided | Error. To remove `applied`, delete the application. |

Voiding a `closed` event reopens the application. Advancing to a stage at or below the
current maximum is allowed (repeat interview rounds, events logged out of order). It
just doesn't change the maximum stage.

## Derived state (`core.derive`)

| Value | Definition |
|---|---|
| `live` | Events minus voided targets and minus the `voided` markers, sorted by `occurred_at`, then `recorded_at` |
| `appliedAt` | `occurred_at` of the `applied` event |
| `maxStage` | Highest stage among live `advanced` events, otherwise `applied` |
| `status` | `closed(outcome)` if the last live `closed` event exists, otherwise `open` |
| `lastActivityAt` | Latest `occurred_at` among live `applied` / `advanced` / `closed` events. **Notes don't count**, because a note isn't contact from the employer. |
| `isStale` | `open` and `now − lastActivityAt > ghost_threshold_days` |
| `firstResponseAt` | First live `advanced` or `closed(rejected)` after `appliedAt`. Withdrawals aren't responses. |
| `timeToFirstResponse` | `firstResponseAt − appliedAt` |

Ghosting is never stored. An application can un-ghost the moment an email arrives, and
storing it would be a lie.

## Analytics (`core.analytics`)
| Metric | Definition |
|---|---|
| Applications | Count in range (by `appliedAt`) |
| Response rate | Applications with a `firstResponseAt` ÷ applications |
| Interview rate | `maxStage ≥ interview` ÷ applications |
| Offer rate | `maxStage = offer` ÷ applications |
| Ghost rate | Stale open applications ÷ applications older than the ghost threshold (a fair denominator) |
| Median time to first response | Over applications that got a response |
| Funnel | For each stage, the count of applications whose `maxStage` reached it |

## Sankey derivation (`core.sankey`)

**Node path per application:**
1. Start with `Applied`.
2. Walk live `advanced` events in time order. Push a stage only if it's **higher** than
   the last stage in the path. Stages strictly increase, so the graph can never loop:
   repeated interview rounds and out-of-order events collapse.
3. Add a terminal node:
   - closed → `Rejected` / `Withdrew` / `Accepted` / `Declined`
   - open, stale, still at Applied → `No response`
   - open, stale, past Applied → `Ghosted`
   - open, fresh, still at Applied → `Awaiting reply` (otherwise the source node would
     under-count applications)
   - open, fresh, past Applied → no terminal node; the flow ends at its stage

**Edges:** count consecutive pairs across all applications. Nodes with the same name merge
(every `Rejected` is one node), which matches the Reddit style.

### Worked example (copy these into `core` tests verbatim)
```
A  applied → advanced(screen) → advanced(interview) → advanced(interview) → advanced(offer) → closed(accepted)
   path: Applied → Screen → Interview → Offer → Accepted        (round 2 collapses)
B  applied → advanced(screen) → closed(rejected)
   path: Applied → Screen → Rejected
C  applied → closed(rejected)
   path: Applied → Rejected
D  applied, then 30 days of silence
   path: Applied → No response
E  applied → advanced(interview), then 25 days of silence
   path: Applied → Interview → Ghosted
F  applied 3 days ago
   path: Applied → Awaiting reply
G  applied → advanced(screen) 5 days ago
   path: Applied → Screen                                      (ends at stage)
H  applied → advanced(screen) → voided(that screen event) → closed(rejected)
   path: Applied → Rejected                                    (voided event ignored)
```

SankeyMATIC output, sorted by source stage and then by count descending:
```
Applied [3] Screen
Applied [2] Rejected
Applied [1] Interview
Applied [1] No response
Applied [1] Awaiting reply
Screen [1] Interview
Screen [1] Rejected
Interview [1] Offer
Interview [1] Ghosted
Offer [1] Accepted
```
The same edges are returned as `{ nodes, links }` JSON for `d3-sankey`. Node labels can
be configured, e.g. renaming "No response" to "Ghosted".

## Open decisions
1. **Online assessments.** v1 maps them to `screen`. Tech-focused Reddit charts often
   show "OA" as its own node. Revisit with real data, likely as an optional stage.
2. **Merging duplicates.** v1 offers only delete. Merge (move events from B to A) is a
   v1.1 candidate.
3. **Company normalization.** `company_key` + `company_domain` is enough for matching.
   A separate `company` table waits until per-company stats or contacts are needed.
