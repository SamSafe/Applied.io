# Applied.io — Build Roadmap

Ordered milestones. Each is independently runnable/demoable. CLI comes before GUI because
it exercises the full core with the least UI surface — once the CLI works, the desktop app
is "just another frontend" over a proven core.

## M0 — Skeleton (architecture made real)
- [ ] Create `Applied.sln` with the four projects (`Core`, `Data`, `Cli`, `Desktop`).
- [ ] Wire dependency rules (Cli/Desktop → Core + Data; Core depends on nothing).
- [ ] `Applied.Core`: define `Application`, `StageEvent`, `Stage`, `Outcome`.
- [ ] `Applied.Data`: `AppliedDbContext`, first EF migration, `AppliedPaths.DatabaseFile`.
- [ ] `applied --help` runs; first run creates the SQLite file at the resolved path.
- **Done when:** `applied where` prints the db path and the file exists.

## M1 — Core capture loop (CLI)
- [ ] `IApplicationRepository` in Core; EF implementation in Data.
- [ ] `applied add` (creates app + initial `Applied` event).
- [ ] `applied list` / `applied show` (Spectre tables + timeline).
- [ ] `applied advance` / `reject` / `withdraw` / `accept` / `decline`.
- [ ] Handle-prefix resolution (first 8 chars, ambiguity error).
- **Done when:** you can run a full add → advance → reject cycle and see it in `list`.

## M2 — Derived intelligence
- [ ] `GhostDetector` in Core (derive ghosted, configurable threshold).
- [ ] `applied ghosted`.
- [ ] `AnalyticsService`: response rate, ghost rate, offer rate, time-to-response, funnel.
- [ ] `applied stats`.
- **Done when:** `applied stats` reports correct numbers against a seeded dataset.

## M3 — The hero feature: Sankey
- [ ] `SankeyBuilder` in Core: event log → consecutive pairs → counts → SankeyMATIC text.
- [ ] Synthesize terminal `Ghosted` for stale-active apps.
- [ ] `applied sankey` (text to stdout).
- [ ] `applied sankey --png` (render to image).
- **Done when:** real data produces a correct, shareable Sankey graphic.

## M4 — Desktop app (Avalonia)
- [ ] Avalonia MVVM shell over the same Core + Data.
- [ ] Pipeline board: columns per stage, cards per application.
- [ ] Drag a card between columns → appends a `StageEvent` (same path the CLI uses).
- [ ] Embedded Sankey view + "Export PNG" / "Copy share text".
- **Done when:** add via CLI, refresh GUI, see the card; move it, see it in `applied show`.

## M5 — The magic: auto-status from email (later)
- [ ] Ingest forwarded / synced emails.
- [ ] Classify ("thanks for applying" / "schedule interview" / "moved forward with others").
- [ ] Append the inferred `StageEvent` automatically (append-only model makes this clean).
- **Done when:** forwarding a rejection email auto-closes the matching application.

## Growth layer (post-MVP)
- [ ] Public share pages for Sankey graphics with subtle "made with Applied.io" attribution.
- [ ] Anonymized community benchmarks ("your response rate vs. median for similar roles").
- [ ] Optional cloud sync between devices.

## Definition of MVP
**M0–M3 shipped via the CLI.** That alone is a genuinely useful personal tool *and*
produces the shareable graphic that drives growth. M4 (GUI) and M5 (email) are
force-multipliers, not prerequisites.
