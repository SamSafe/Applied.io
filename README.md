# Applied.io

A local-first job-application tracker that turns your application history into the
shareable Sankey graphic people post on Reddit — automatically.

Two frontends over one shared core:
- **`applied` CLI** — fast capture, scriptable, lives in your terminal workflow.
- **Desktop app** (Avalonia) — pipeline board + visualize/share.

Both operate on the **same local SQLite database**, so capture in the terminal and review
in the GUI.

## Why it's different
Existing trackers treat the chart as an afterthought. Here the **auto-generated Sankey is
the front door**: every shared graphic is a "made with Applied.io" billboard, and the
share loop feeds anonymized community benchmarks no competitor can match without scale.

## The one idea to understand first
**Status is a history, not a field.** Applications store an append-only log of stage
transitions; current status, ghost detection, time-to-response, and the Sankey are all
*derived* from it. Read [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) before writing code.

## Documentation
| Doc | What it covers |
|-----|----------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Solution layout, dependency rules, tech choices, shared-db paths |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entities, enums, the event-log design, Sankey derivation |
| [docs/CLI.md](docs/CLI.md) | Full `applied` command surface and conventions |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Ordered build milestones; MVP = M0–M3 via CLI |

## Stack
.NET 8 · C# · EF Core + SQLite · System.CommandLine + Spectre.Console (CLI) · Avalonia (GUI)

## Status
Design phase. The `src/main/java/Application.java` file is the original Java prototype and
is **superseded** by this design — kept only for reference until the C# core lands.
