# Applied.io — Data Model

The single most important design decision: **status is a history, not a field.**

A Sankey diagram is a picture of *flows between stages* (`Applied → Screen → Rejected`).
It cannot be drawn from a single current-status field — you need the **path** each
application took. The same is true for time-to-response, funnel conversion, and ghost
detection. So we store an **append-only event log** and *derive* everything else.

## Entities

### `Application` — the static facts
| Field       | Type        | Notes                                            |
|-------------|-------------|--------------------------------------------------|
| `Id`        | `Guid`      | Stable id. CLI shows first 8 chars as a handle.  |
| `Company`   | `string`    | Plain string for MVP (normalize to a table later).|
| `Position`  | `string`    | Job title.                                       |
| `ReqNumber` | `string?`   | Requisition #. Null/empty allowed.               |
| `Location`  | `string?`   | Null/empty allowed.                              |
| `Url`       | `string?`   | Link to the posting.                             |
| `Source`    | `string?`   | LinkedIn, Indeed, referral, company site...      |
| `Notes`     | `string?`   | Freeform.                                        |
| `AppliedOn` | `DateOnly`  | Date applied. Defaults to today.                 |
| `Events`    | `List<StageEvent>` | The history. The heart of the model.      |

### `StageEvent` — one transition, immutable
| Field        | Type       | Notes                                           |
|--------------|------------|-------------------------------------------------|
| `Id`         | `Guid`     |                                                 |
| `Stage`      | `Stage`    | Which funnel stage this event represents.       |
| `Outcome`    | `Outcome`  | `Active` while in flight; terminal when closed. |
| `OccurredAt` | `DateTime` | When the transition happened.                   |
| `Note`       | `string?`  | e.g. "recruiter call went well".                |

**Append-only discipline:** you *add* events; you never edit or delete old ones. This is
what makes analytics and the Sankey trustworthy — you record what *happened*, not just
where things *are*. It is also exactly the shape the future email-auto-update feature
writes into ("interview email arrived" → append `Interview` event).

## Enums

```
Stage:    Applied → Screen → Interview → Final → Offer      (ordered funnel)
Outcome:  Active | Rejected | Withdrawn | Accepted | Declined
```

- `Stage` is the **progress** axis (how far the application got).
- `Outcome` is the **disposition** axis (is it still live, and if closed, how).
- A live application's latest event has `Outcome.Active`. Closing an application means
  appending an event with a terminal outcome (e.g. `Stage=Interview, Outcome=Rejected`).

### Why `Ghosted` is NOT an enum value
Ghosting is **derived, never stored**. An application is ghosted when:

> its latest event is `Outcome.Active` **AND** `Today − latestEvent.OccurredAt > GhostThreshold` (default **21 days**).

Storing it as a field would be a lie — a "ghosted" app can un-ghost the moment they reply,
and you must never lose that truth by overwriting state. Compute it on read.

## Everything derives from the event log

| Want                | Derivation                                                          |
|---------------------|---------------------------------------------------------------------|
| Current status      | `Events.OrderBy(e => e.OccurredAt).Last()`                          |
| Is ghosted          | latest is `Active` and silent > threshold (see above)               |
| Time-to-response    | `firstNonAppliedEvent.OccurredAt − AppliedOn`                       |
| Reached stage X     | `Events.Any(e => e.Stage >= X)`                                     |
| Funnel counts       | for each stage, count apps that ever reached it                     |
| Sankey ribbons      | group consecutive event pairs across all apps; count each pair      |

## Sankey derivation (the hero query)

For every application, walk its events in time order to produce consecutive
`(from → to)` pairs, then count identical pairs across all applications. Each distinct
pair with its count is one ribbon.

```
App A: Applied → Screen → Interview → Offer
App B: Applied → Screen → Rejected
App C: Applied → Rejected
App D: Applied → (silent 30d)         → synthesize "Applied → Ghosted"

Pairs:
  Applied → Screen      x2
  Applied → Rejected    x1
  Applied → Ghosted     x1   (ghosted synthesized at read time for silent-active apps)
  Screen  → Interview   x1
  Screen  → Rejected    x1
  Interview → Offer     x1

SankeyMATIC text:
  Applied [2] Screen
  Applied [1] Rejected
  Applied [1] Ghosted
  Screen [1] Interview
  Screen [1] Rejected
  Interview [1] Offer
```

`SankeyBuilder` emits exactly that text. Terminal "Ghosted" is synthesized for any app
whose tail is a stale `Active` event, so the chart reflects reality without polluting the
stored log.

## Open design decisions (resolve before/while coding)

1. **Multiple interview rounds** — model as *repeated* `Interview` events (simplest;
   round 1, round 2 are two events) rather than a `round` counter. Recommended: repeated.
2. **Company/Contact tables** — keep `Company` a plain string for MVP; normalize into
   `Company` + `Contact` tables only when you add recruiter contacts / per-company stats.
3. **Ghost threshold** — default 21 days; make it a user setting eventually.
