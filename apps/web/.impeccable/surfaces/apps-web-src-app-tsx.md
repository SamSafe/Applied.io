---
version: 1
slug: "apps-web-src-app-tsx"
primary_target: "apps/web/src/App.tsx"
related_targets: []
---

# Surface brief: tracker app (M2)

Scope: the signed-in web app — pipeline list, application detail, add/edit, settings, sign-in. Mode: Operate.
Audience: an active job seeker (20+ applications), on laptop and phone about equally.
Jobs, in order: scan the whole pipeline; see what changed since last visit; record a step or undo one; add an application by hand.
Constraints: must not feel like a cold spreadsheet; standard web controls; no shipping vocabulary in copy (job words only).
Memorable moment: the shared-timeline tracking bars — silence you can see.
Unresolved: Insights (stats/Sankey) screen arrives in M5; email-driven "updates" become real in M3–M4 (synthetic seed data until then).

## Direction contract

THESIS: Each application is a shipment being tracked and each email is a scan. Refuses the category's Kanban columns and its grey table: the pipeline is one shared timeline of tracking bars.

OWN-WORLD: Deep spruce livery bar (#0E3B2E) over white label stock (#F6F7F4 ground, #FFFFFF rows). Ink #16181A. One fixed stage colour set (applied slate, screen teal, interview blue, final violet, offer green; rejected brick, ghosted fog) used identically in bars, chips and filters. Scan yellow (#FFC933) means only "new since your last visit". Closed rows go grey but stay. Archivo Variable (self-hosted; width axis 86% for headings) with tabular figures; monospace only for the tracking handle. (Built; see DESIGN.md.)

STORY: You open it, see "3 updates since you last looked", read every bar left to right in seconds, open the one that moved, confirm or undo the step, and leave knowing exactly where everything stands.

FIRST VIEWPORT: Livery bar (wordmark, search, Add application, account). Below on label stock: "Pipeline" title with counts, yellow updates strip, filter tabs with counts (All · Open · Updates · Ghosted · Closed), shared date axis, then rows: company and role left, tracking bar spanning the middle on the shared time axis (stage nodes at event dates, solid to the last scan, dashed silence to today), stage chip and relative time right. Selecting a row opens the detail panel at right (full screen on phone): tracking label header, current status, actions, scan history newest first with Undo.

FORM: Parcel Tracking — position 3 on the ordered list, seed key ab4e9f1b. Raises: elapsed-time segments (Labanotation), yellow reserved for change (Metro), grey-but-kept closed rows (Character catalog), fixed stage colours (Transit). Code-led (no image generation).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
