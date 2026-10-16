---
name: Applied
description: A job-application tracker that updates itself from your email, drawn as a tracking page.
colors:
  livery: "#0e3b2e"
  livery-raised: "#164a3a"
  on-livery: "#f2f7f4"
  on-livery-muted: "#a9c2b7"
  ground: "#f6f7f4"
  surface: "#ffffff"
  surface-sunk: "#eef1ed"
  surface-hover: "#f9faf8"
  surface-selected: "#e8f1ec"
  line: "#dfe3dd"
  line-strong: "#c5ccc3"
  ink: "#16181a"
  ink-2: "#4b5156"
  ink-3: "#676d72"
  scan: "#ffc933"
  scan-soft: "#fff4cc"
  scan-edge: "#ecd27a"
  scan-ink: "#4a3800"
  stage-applied: "#66717d"
  stage-screen: "#13827a"
  stage-interview: "#2e63d1"
  stage-final: "#7347c9"
  stage-offer: "#198a4c"
  stage-rejected: "#b04a33"
  stage-withdrawn: "#8c7b5e"
  stage-ghosted: "#9aa0a6"
  closed: "#b9bec2"
  danger: "#a8341f"
  danger-raised: "#8f2b18"
  danger-soft: "#fbece8"
  danger-edge: "#efc4b9"
  danger-ink: "#6e2213"
  selection: "#cfe3d9"
typography:
  headline:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 86"
  status:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 720
    lineHeight: 1.05
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 86"
  headline-sm:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 720
    lineHeight: 1.12
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 86"
  title-lg:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 640
    lineHeight: 1.3
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.87rem"
    fontWeight: 600
    lineHeight: 1.3
  micro:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.2
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "0.82rem"
    fontWeight: 400
    letterSpacing: "0.04em"
rounded:
  hairline: "2px"
  xs: "4px"
  sm: "6px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.livery}"
    textColor: "{colors.on-livery}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.livery-raised}"
    textColor: "{colors.on-livery}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-quiet-hover:
    backgroundColor: "{colors.surface-sunk}"
  button-add:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.livery}"
    rounded: "{rounded.sm}"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
    height: "38px"
  tab-count:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
  tab-count-active:
    backgroundColor: "{colors.livery}"
    textColor: "{colors.on-livery}"
  new-pill:
    backgroundColor: "{colors.scan}"
    textColor: "{colors.scan-ink}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  updates-strip:
    backgroundColor: "{colors.scan-soft}"
    textColor: "{colors.scan-ink}"
    rounded: "{rounded.md}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: Applied

## Overview

**Creative North Star: "The Tracking Page"**

Applied draws every job application as a shipment being tracked, and every email as a scan.
The interface borrows a carrier's tracking page: a painted livery bar, white label stock,
and a progress line per application. It refuses the category's Kanban columns and grey
tables. The pipeline is one shared timeline where each application's bar starts on the day
you applied and runs to today. Silence is drawn to its real length, so ghosting is
something you can see instead of something you forget.

The world shows up in the form, never in the words. Copy uses job vocabulary only ("Moved
to interview", "No news for 24 days"), and the tracking metaphor lives in the bars, the
scan-yellow node, the perforated label head, and the status word set large at the top of
the detail panel. Everything else is plain, dense, standard product UI that a job seeker
can operate without learning anything.

The screen is light, matching the daytime desk-and-phone scene it's used in. Colour does
real work: the livery owns the shell, the stage colours encode progress, yellow encodes
news, and grey encodes closure.

**Key Characteristics:**
- Deep spruce livery bar over cool white label stock
- One shared time axis for every application's tracking bar
- Dashed silence drawn to scale; yellow only for what's new
- Fixed stage colours, identical everywhere they appear
- One variable family (Archivo) with its width axis carrying the label character

## Colors

A restrained neutral field with a painted shell, a fixed stage palette that does the
encoding, and one reserved signal colour.

### Primary
- **Livery Spruce** (`livery`): the shell. The top bar, primary buttons, the active tab
  underline and active tab count, focus rings, and the caret. **Livery Raised**
  (`livery-raised`) is its hover state.
- **Livery Ink** (`on-livery`) and **Livery Mist** (`on-livery-muted`): text on the livery.
  Mist is for secondary nav items and placeholders.

### Secondary
- **Scan Yellow** (`scan`): the unseen node on a tracking bar, the "New" pill, and the
  Updates tab count. **Scan Soft** (`scan-soft`) with **Scan Edge** (`scan-edge`) forms
  the updates strip, and **Scan Ink** (`scan-ink`) is text on yellow.

### Tertiary: the stage set
- **Applied Slate** (`stage-applied`), **Screen Teal** (`stage-screen`), **Interview
  Blue** (`stage-interview`), **Final Violet** (`stage-final`), **Offer Green**
  (`stage-offer`): progress, in funnel order.
- **Rejected Brick** (`stage-rejected`), **Withdrew Khaki** (`stage-withdrawn`, also used
  for declined), **Ghost Fog** (`stage-ghosted`, also used for dashed silence): outcomes
  and silence.
- **Closed Grey** (`closed`): every bar, node and chip dot on a closed application.

### Neutral
- **Label Ground** (`ground`): the page field, a cool near-white, never cream.
- **Label Stock** (`surface`): rows, panels, inputs. **Sunk** (`surface-sunk`) is the
  second neutral layer: the axis header, form wells, quiet-button hover.
- **Hover** (`surface-hover`) and **Selected** (`surface-selected`, a spruce tint): row
  states.
- **Rule** (`line`) and **Strong Rule** (`line-strong`): dividers and control borders.
- **Ink** (`ink`), **Ink 2** (`ink-2`, secondary text), **Ink 3** (`ink-3`, tertiary text,
  ≥4.5:1 on white).
- **Danger** (`danger`, hover **Danger Raised** `danger-raised`) on **Danger Soft** (`danger-soft`)
  with **Danger Edge** (`danger-edge`) borders and **Danger Ink** (`danger-ink`) text: destructive
  confirmations and error banners only.
- **Selection** (`selection`): the text-selection highlight, a pale spruce.

### Named Rules
**The Scan Yellow Rule.** Yellow means "new since your last visit" and nothing else. It is
never a primary action, a focus ring, a warning or a decoration. If a screen has no news,
it has no yellow.

**The Fixed Stage Colour Rule.** Each stage owns one colour everywhere: tracking bars,
chips, history nodes, filters, and the Sankey to come. A new surface reuses the set and
never invents a stage colour.

**The Grey but Kept Rule.** A rejected, withdrawn or declined application drops to Closed
Grey but keeps its row and history. An accepted offer keeps its colour.

## Typography

**Display Font:** none. Product UI here needs no display face.
**Body Font:** Archivo Variable (self-hosted via @fontsource-variable, falling back to
system-ui)
**Label/Mono Font:** ui-monospace, for references and addresses only

**Character:** a single grotesk whose width axis does the expressive work. Headings run
semi-condensed (86%), like the bold type on a shipping label. Company names run at 92% so
long names fit. Body text stays at normal width for reading. All dates and counts use
tabular figures.

### Hierarchy
- **Headline** (700, 1.85rem, 1.1): page titles ("Pipeline", "Settings"). The detail
  label's company name uses 720 at 1.6rem.
- **Status** (720, 1.9rem, 1.05): the status word that leads the detail panel ("Offer",
  "Interview", "Ghosted").
- **Headline small** (720, 1.6rem, 1.12): the detail label's company name, the sign-in title,
  and page titles on phones.
- **Title large** (700, 1.2rem): form headings ("Edit details"), empty-state headings, the
  wordmark, and the Gmail confirmation code (in mono).
- **Title** (640, 1rem, 92% width): company names in rows. Section titles use 680.
- **Body** (400, 15px, 1.45): everything readable. Notes keep a 65–75ch measure.
- **Label** (600, 0.87rem): field labels and chips.
- **Micro** (650, 0.75rem): axis ticks, count pills, "New", step numbers, keyboard hints.
- **Mono** (0.82rem, +0.04em tracking): the "Ref" and forwarding addresses.

### Named Rules
**The One Family Rule.** Archivo carries every role. Emphasis comes from weight and width,
never from a second face. Mono appears only where the content is a code: a reference or an
email address.

**The Status Word Rule.** On a detail view, the current status is the largest text in the
panel, the way a tracking page leads with "Delivered".

## Layout

A sticky 56px livery bar sits over a 1440px-max content column with 24px gutters (16px
below 820px). The pipeline is a single bordered board. On desktop each row is a
three-column grid: application (170–250px), tracking bar (fluid), status (176px). A shared
axis header labels the bar column with weekly or monthly ticks and "Today" at the right,
keeping at least 64px between labels.

Selecting a row opens a 460px detail panel beside the list. It's sticky and scrolls on its
own. Below 1180px the panel replaces the list and gets a back link. Below 820px each row
stacks: name and role with the status chip on the right, then the bar at full width. The
main nav folds into the account menu, the tab row scrolls sideways under a fade, and
"Add application" shrinks to its icon.

Spacing runs on a 4px base (4 / 8 / 12 / 16 / 24), with more space above a section than
below it.

## Elevation & Depth

Flat label stock. Surfaces sit on the ground with 1px rules and tonal layers (ground,
surface, sunk). Shadows exist only for things that float: the detail panel on wide screens
and the account menu.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgb(14 59 46 / 0.06), 0 12px 32px -8px rgb(14 59 46 / 0.14)`):
  the detail and add panels beside the list.
- **Pop** (`box-shadow: 0 2px 4px rgb(14 59 46 / 0.08), 0 16px 40px -10px rgb(14 59 46 / 0.24)`):
  menus.

### Named Rules
**The Flat Stock Rule.** Rows and boards never cast shadows. Depth is a floating panel or
nothing.

## Shapes

Gently rounded label corners: 6px on controls and 10px on boards, panels and strips. Small
inner parts (segmented-control segments, keyboard hints, skeleton bars) use 4px, and hairline
geometry (tracking segments, active underlines) uses 2px.
Counts and "New" use full pills, and tracking nodes are circles. One material detail is
allowed: the **perforation**, a 2px dashed rule that separates the detail panel's label
head from its body, like the tear line on label stock.

## Components

### Buttons
- **Shape:** 6px corners, 36px tall (30px small), 560 weight.
- **Primary:** Livery Spruce with Livery Ink text, for one main action per area ("Moved to
  final round…", "Accepted the offer", "Save").
- **Secondary:** Label Stock with a Strong Rule border.
- **Quiet:** no border until hover (Sunk background), for low-priority actions like "Add
  note" and "Undo".
- **Danger:** Danger text on transparent, and Danger solid inside a confirmation.
- **Hover / Focus:** 150ms colour transitions, with a 2px livery focus ring offset 2px
  (white on the livery bar).

### Chips
- **Stage chip:** an 8px dot in the stage colour plus a 600-weight label in ink. On closed
  rows the dot is Closed Grey and the label Ink 2.
- **New pill:** Scan Yellow with Scan Ink, 0.72rem at 700.

### Cards / Containers
- **Board:** Label Stock, 1px Rule border, 10px corners, rows divided by 1px rules.
- **Panel:** Label Stock, 10px corners, Panel shadow, perforation under the label head.
- **Updates strip:** Scan Soft with a 1px Scan Edge border and a yellow scan dot.

### Inputs / Fields
- **Style:** 38px tall, 1px Strong Rule border, 6px corners, Ink 3 placeholder.
- **Focus:** the border turns Livery Spruce, with a 3px spruce halo at 16% opacity.
- **Error:** a Danger border, plus an inline banner that names the problem and the fix.
- **Search (on livery):** translucent white fill and a 16% white border, brightening on
  focus, with a "/" shortcut hint.

### Navigation
- **Top bar:** wordmark (mark plus "Applied", 760 weight at 92% width), text nav in Livery
  Mist with the active item in Livery Ink and a 2px underline, then search, Add and the
  account menu.
- **Tabs:** text tabs with count pills. The active tab gets a livery underline and a
  livery count, and the Updates count turns yellow when it's above zero.

### Tracking Bar (signature)
An application's steps on a time axis. A 1px rail spans the whole width. Solid 3px
segments are coloured by the stage reached. Nodes sit at event dates:
- **Applied:** hollow ring.
- **Stage:** filled circle in the stage colour.
- **Outcome:** terminal mark (X, check or dash) on a coloured disc.
- **Unseen:** Scan Yellow with an ink ring, pinging twice.

A dashed Ghost Fog tail runs from the last news to today. In lists, every bar shares one
axis. On the detail panel the bar uses its own scale, with start and end dates beneath.
It is decorative to assistive technology; the chip and phrase beside it carry the meaning.

### History (scan log)
Newest first, on a 2px vertical rule. Each item has a node in its stage colour, a title in
job vocabulary, the date and time with its origin ("from an email" or "added by you"), and
an optional note. Undo appears on hover or focus (always on touch). Undone items are
struck through with "undone {date}". Steps that arrive while the panel is open stamp in
over 320ms.

## Do's and Don'ts

### Do:
- **Do** draw time to scale on a shared axis whenever more than one application is shown.
- **Do** mark news with the Scan Yellow node and the "New" pill, and clear it once the
  application is opened.
- **Do** reuse the stage colour set exactly, and grey closed applications without removing
  them.
- **Do** lead detail views with the status word at status scale (1.9rem, 720).
- **Do** use tabular figures for every date, count and duration.

### Don't:
- **Don't** use yellow for anything except news.
- **Don't** mark rows with coloured side stripes; news lives on the bar's node.
- **Don't** use shipping words in copy ("delivered", "in transit", "parcel"). The world
  stays in the form.
- **Don't** introduce a second typeface or use mono for anything but references and
  addresses.
- **Don't** put kickers or eyebrows above headings.
