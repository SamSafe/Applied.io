# Applied.io — Architecture

A local-first job-application tracker with two frontends (CLI + desktop GUI) over a
single shared core. The Sankey share-graphic is the product's growth engine, not an
afterthought.

## Guiding principles

1. **Local-first.** All data lives on the user's machine in a single SQLite file. No
   account required to use the core product. (Sharing/sync is an optional later layer.)
2. **One brain, many faces.** All domain logic lives in `Applied.Core`. The CLI and the
   desktop app are thin presentation layers that call into it. Any feature written once
   (ghost detection, Sankey, analytics, future email-parsing) is available to both.
3. **History, not state.** Application status is never a mutable field. It is derived
   from an append-only log of stage transitions. See `DATA_MODEL.md`.
4. **Cross-platform.** Core + Data + CLI run anywhere .NET runs (incl. WSL/Linux). The
   GUI uses Avalonia (not WPF) so the desktop app is cross-platform too.

## Solution layout

```
Applied.sln
├── Applied.Core/       Domain model + business logic. NO UI deps, NO direct DB deps.
│     ├── Model/          Application, StageEvent, Stage, Outcome
│     ├── Ghosting/       GhostDetector (derives "ghosted" from event history)
│     ├── Sankey/         SankeyBuilder (event log -> flow counts -> SankeyMATIC text)
│     └── Analytics/      AnalyticsService (response rate, time-to-response, funnel)
│
├── Applied.Data/       Persistence. EF Core + SQLite.
│     ├── AppliedDbContext
│     ├── Migrations/
│     └── Repositories/   IApplicationRepository + EF implementation
│
├── Applied.Cli/        Console app. System.CommandLine + Spectre.Console.
│
└── Applied.Desktop/    Avalonia app (MVVM).
```

## Dependency rules (enforce these)

```
Applied.Cli ─────┐
                 ├──► Applied.Core ◄── Applied.Data
Applied.Desktop ─┘                         │
                                           └──► (Core defines interfaces,
                                                 Data implements them)
```

- `Core` depends on **nothing** in this solution. It is pure domain + logic, fully
  unit-testable with no database.
- `Core` defines persistence **interfaces** (e.g. `IApplicationRepository`). `Data`
  implements them against EF Core. This keeps `Core` ignorant of SQLite.
- `Cli` and `Desktop` depend on `Core` (for logic) and `Data` (to wire up the concrete
  repository at startup via DI). They never depend on each other.

## Shared database

Both frontends open the **same** SQLite file so they operate on one dataset:

| OS            | Path                                            |
|---------------|-------------------------------------------------|
| Linux / WSL   | `~/.applied/applied.db`                          |
| macOS         | `~/Library/Application Support/Applied/applied.db` |
| Windows       | `%APPDATA%\Applied\applied.db`                   |

Resolve via a single helper in `Applied.Data` (`AppliedPaths.DatabaseFile`) so both
frontends agree. Allow override with the `APPLIED_DB` environment variable (useful for
tests and for keeping a separate "demo" dataset).

**Workflow payoff:** capture a job from the terminal (`applied add ...`) and it appears
in the desktop pipeline view. CLI = fast capture; GUI = review + visualize.

## Tech choices (rationale)

| Concern        | Choice                | Why                                              |
|----------------|-----------------------|--------------------------------------------------|
| Language       | C# / .NET 8           | Java-adjacent (easy switch), great for desktop+CLI |
| GUI            | Avalonia UI (MVVM)    | WPF-like XAML, but cross-platform (runs on WSL)  |
| Persistence    | EF Core + SQLite      | Single-file, zero-config, local-first            |
| CLI parsing    | System.CommandLine    | Subcommands, `--help`, completions for free      |
| CLI output     | Spectre.Console       | Tables, color, progress — nice scriptable UX     |
| Sankey render  | SankeyMATIC text first; image render later | Text composes in pipes; PNG is convenience layer |

See `DATA_MODEL.md` for entities and `CLI.md` for the command surface.
See `ROADMAP.md` for build order.
