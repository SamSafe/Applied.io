# Applied.io — CLI Specification

`applied` is the fast-capture, scriptable frontend. It shares the SQLite database with
the desktop app, so anything you add here shows up there.

Design goals: **fast to type**, **composable** (plays nice in pipes), **scriptable**
(stable output, sensible exit codes).

## Conventions

- **Handles, not GUIDs.** Commands that target an application accept the first 8 chars of
  its `Id` (or any unambiguous prefix). `applied add` prints the new handle. Ambiguous
  prefixes error with the candidates listed.
- **Exit codes:** `0` success · `1` not found / ambiguous · `2` usage error.
- **`--json` flag** on read commands (`list`, `show`, `stats`) for machine-readable output.
- **Defaults to stdout text** for everything, so commands compose in pipes.

## Commands

### Capture
```
applied add <position> --company <name> [--req <n>] [--location <loc>]
                       [--url <link>] [--source <src>] [--note <text>]
    → creates an Application with an initial `Applied` event (date = today)
    → prints the new handle, e.g.  "added  a1b2c3d4  Staff SWE @ Stripe"
```

### Move through the pipeline (each appends a StageEvent)
```
applied advance <handle> --to <stage> [--note <text>] [--at <date>]
    stage ∈ { screen, interview, final, offer }

applied reject   <handle> [--note <text>] [--at <date>]     # Outcome.Rejected
applied withdraw <handle> [--note <text>]                   # Outcome.Withdrawn
applied accept   <handle>                                   # Outcome.Accepted (took offer)
applied decline  <handle>                                   # Outcome.Declined (turned down)
```

### Inspect
```
applied list [--stage <stage>] [--active] [--ghosted] [--company <name>] [--json]
    → Spectre table: handle · company · position · current stage · age · status

applied show <handle> [--json]
    → full event history (timeline) for one application

applied ghosted
    → everything auto-flagged ghosted (Active + silent > threshold)
```

### Analyze & share
```
applied stats [--json]
    → response rate, ghost rate, offer rate, median time-to-first-response, funnel counts

applied sankey                 # emit SankeyMATIC text to stdout (composes: | pbcopy)
applied sankey --png <file>    # render the graphic directly to a PNG
applied sankey --since <date>  # limit to applications on/after a date
```

### Config
```
applied config get|set ghost-threshold-days <n>     # default 21
applied where                                        # print the active db path
```

## Example session
```
$ applied add "Staff SWE" --company Stripe --req R-1234 --source linkedin
added  a1b2c3d4  Staff SWE @ Stripe

$ applied advance a1b2 --to screen --note "recruiter reached out"
a1b2c3d4  Applied → Screen

$ applied list --active
HANDLE    COMPANY   POSITION    STAGE     AGE   STATUS
a1b2c3d4  Stripe    Staff SWE   Screen    3d    active

$ applied stats
Applications     42
Response rate    31%   (13/42 got past Applied)
Ghost rate       40%   (17/42 silent > 21d)
Offers           3
Median time-to-first-response   6 days

$ applied sankey | pbcopy        # paste into sankeymatic.com, or use --png
```

## Notes for implementation
- Build the command tree with **System.CommandLine**; each subcommand binds to a handler
  that resolves `IApplicationRepository` (concrete impl from `Applied.Data`) via DI.
- Keep handlers thin: parse args → call a `Core` service → render with Spectre. No domain
  logic in the CLI layer.
- `--at <date>` lets you backfill events when you forgot to log in real time. Accept ISO
  `YYYY-MM-DD`.
