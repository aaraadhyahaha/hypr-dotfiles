# Desktop widgets + Widget Gallery (AGS)

## Context

You want macOS-style widgets on the desktop: interactive, draggable, resizable between fixed sizes, and themed by the matugen accent like the rest of the shell. The productivity widgets cover fx (today's stats and open tasks), clock, calendar, system and a note. A macOS-style Widget Gallery adds them, and it includes "vision" widgets (image + goal, countdown) so the desktop can work as a vision board.

What you decided:
- **Gallery:** macOS-style (browse → pick size → add), with Vision widgets as one category.
- **fx:** read-only. Add `fx status --json` to the fx repo so fx stays the single source of truth for score, streak and focus. The widgets never write to fx.db.
- **Editing:** you can drag a widget anytime (its buttons still click). Hovering shows a corner handle that snaps between the widget's sizes. Right-click on the desktop → **Edit Widgets** opens the gallery and shows remove badges.
- **v1 widgets:** fx Today, fx Tasks, Clock, Calendar, System, Note, plus Vision: Goal card and Countdown.

Assumptions (please correct any):
- One monitor only: eDP-1, 1920×1080 at Hyprland scale 1.25. GTK lays out in logical pixels (1536×864), so the grid is sized from that and widgets render crisp at 1.25. There's no multi-monitor support.
- Widgets sit above the wallpaper and below windows (layer BOTTOM), so they show on an empty workspace. Like macOS, edit mode lifts the desktop above windows and dims them.
- Accent changes need no extra code: matugen's `agsr` post-hook restarts AGS, and every widget colour comes from tokens.

## Approach

**One full-screen desktop layer per monitor, with a `Gtk.Fixed` of widget cards on a snapping grid** (recommended).
I rejected the alternative, one layer surface per widget moved by margins: every drag frame would cost a compositor round-trip, and DESIGN.md forbids animating surface geometry because it jitters. In one surface, dragging, the ghost slot, drag-from-gallery and right-click on empty desktop all stay in-process.

### Grid & sizes (pure, tested: `widget/desktop/layout.ts`)
- Cells are 72px with 12px gaps and a 24px edge margin. Columns and rows come from the monitor geometry minus the bar's exclusive zone (≈17×9 here).
- Spans: **S** 2×2 (156²), **M** 4×2 (324×156), **L** 4×4 (324²), **XL** 8×4 (660×324). Each widget kind declares which sizes it supports.
- Functions: `span`, `cellToPx`, `pxToCell` (rounding snap), `collides`, `clampToGrid`, `nearestFree(layout, item, target, grid)` (the free spot nearest the target by distance; dropping onto an occupied spot moves the dragged widget there, never the others), `firstFree(size)` (scans from the top-left, for adding), `nearestSize(allowed, wPx, hPx)` (resize snapping), `reflow(layout, grid)` (fits items again when the grid shrinks), and `parseLayout`/`serialize` (versioned; drops unknown kinds and bad fields).

### Persistence (`widget/desktop/store.ts`)
- Saved to `~/.local/state/ags/desktop.json` as `{ version: 1, widgets: [{ id, kind, size, col, row, config }] }`.
- Reactive via `createState`. Saves are debounced (300ms) and atomic (`GLib.file_set_contents`). A corrupt file is logged, kept as `desktop.json.bak`, and replaced by the default layout.
- First run gets a default layout: Clock S, Calendar S, fx Today M, fx Tasks L, System M.

### Host (`widget/desktop/Desktop.tsx`, `Frame.tsx`)
- `<window namespace="desktop" layer=BOTTOM anchor=all exclusivity=NORMAL keymode=ON_DEMAND>` holds a `Gtk.Fixed`. ON_DEMAND lets the Note take typing.
- `Frame` wraps each widget: the glass card, a `<Motion>`, a `GestureDrag`, a resize handle, a context menu, and a remove badge.
  - **Drag:** on drag-begin the frame checks what is under the pointer and denies the gesture if it's an Entry, TextView or Calendar, so typing and clicking still work. The drag starts after the GTK dnd threshold. While dragging, the card follows the pointer, scaled to 1.03 (the macOS lift), and a dashed ghost marks the snapped slot. On release the card moves to the slot, and `Motion` animates the leftover offset to rest (new preset `ENTER.settle`).
  - **Resize:** a bottom-right handle appears on hover. Dragging it shows a ghost of `nearestSize`; on release the widget gets the new size, or keeps the old one if that size fits nowhere. The content re-renders from a `size` accessor.
  - **Right-click on a widget:** popover with S/M/L/XL (only the sizes that kind supports), *Edit Widget…* (configurable kinds only) and *Remove Widget*.
- **Right-click on empty desktop:** *Edit Widgets*, and *Change Wallpaper* (calls the existing `toggleWallpapers`).
- **Edit mode** (`toggleEditWidgets`, `ags request toggle-widgets`, **Super+G**, which is free): the layer goes from BOTTOM to TOP, a translucent scrim dims the windows behind (Hyprland blurs it), each widget gets a "–" remove badge, and the Gallery sheet opens. Escape or *Done* exits. The scrim shows wherever there's no widget, so clicking it also exits.

### Gallery (`widget/desktop/Gallery.tsx`)
A bottom sheet inside the desktop surface, so a preview can be dragged straight onto the grid.
```
┌───────────────────────────────────────────────────────────────┐
│ [search……………]                                       [ Done ] │
│ ● Focus    │  fx Today            fx Tasks                    │
│ ○ Time     │  ┌──────┐┌────────┐  ┌────────┐                   │
│ ○ System   │  │ 41   ││ 41 3h09│  │☐ SQL A │   (live previews  │
│ ○ Notes    │  └──────┘└────────┘  └────────┘    at real size)  │
│ ○ Vision   │   S  [M]  L           M  [L]                      │
└───────────────────────────────────────────────────────────────┘
```
- Categories on the left, search filters by name and description, and each kind shows a live preview with a size switcher. Click a preview to add it at `firstFree`, or drag it onto the desktop to place it.

### Widget registry (`widget/desktop/registry.ts`)
`WidgetDef { kind, name, description, category, sizes, defaultSize, defaultConfig?, editor?, render({ size, config, setConfig }) }`. The Gallery, the context menu and `parseLayout` all read from this one list.

| Kind | Sizes | Content |
|---|---|---|
| `fx-today` | S M L | S: score ring + streak. M: adds focus vs 240-min target bar and the active session. L: adds hourly focus bars for the work window and the top 3 open tasks |
| `fx-tasks` | M L | Open tasks by severity (dots), effort, minutes spent; finished today shown struck. Read-only; clicking opens `kitty fx` |
| `clock` | S M | S: analog (cairo, `$primary` second hand). M: digital time + date |
| `calendar` | S L | S: weekday + big date tile. L: month grid (styled `Gtk.Calendar`) |
| `system` | S M | S: CPU and RAM rings. M: CPU, RAM, Disk, Temp sparklines (reuses `Stat`) |
| `note` | S M L | Editable sticky note (`Gtk.TextView`), saved to `config.text` |
| `goal` (Vision) | S M L XL | Image (cover fit, chosen with `Gtk.FileDialog`) + title + caption overlay |
| `countdown` (Vision) | S M | "N days until ⟨title⟩" with a progress ring from the date it was created |

Shared drawing helpers (`ring`, `bars`, `roundRect`) go in `widgets/draw.ts`. `roundRect` is copied from `PomodoroStats.tsx` there, and PomodoroStats then imports it.

### fx bridge (read-only)
- **fx repo:** add `src/fx/status.py` with `status(db, at) -> dict`, built on `state.snapshot`, `scoring.hourly_focus`, `db.active_session` and `db.task_minutes`. `main()` gets argparse: no arguments still runs the TUI, and `fx status --json` prints:
  `{date, checked_in, score, completion, focus, focus_min, target_min, idle_min, window:[start,end], hourly:[…], streak:{days,status}, active:{task_id,title,since}|null, tasks:[{id,title,severity,effort,done,minutes}]}`.
  It never runs Notion sync. fx is an editable uv tool install (`fx.pth`), so the change goes live at once.
- **AGS:** `service/fxModel.ts`, a pure, tested `parseStatus(text) → FxStatus | null`. `service/fx.ts` runs `~/.local/bin/fx status --json` (falling back to `fx` on PATH). It refreshes when `Gio.FileMonitor` sees fx.db or its `-wal` file change (debounced 400ms), and every 60s for the ticking focus and idle minutes. The last good data is kept on a transient failure. States: `missing` (shows "fx isn't installed"), `error`, `ok`.

### Small refactors this needs
- Move the cpu/ram/disk/temp polls from `widget/bar/quicksettings/Resources.tsx` into `service/system.ts`, so Quick Settings and the System widget share one set of polls.
- In `widget/common/motion.ts`: add `ENTER.settle` (from a given offset → rest, `MOTION.enter`, `EASE.out`), `ENTER.add` (scale 0.9 → 1) and `LEAVE.remove` (scale → 0.9 + fade), and document them in DESIGN.md › Motion.

### Smooth & premium: hard requirements
- **Dragging is 1:1 with the pointer.** The card follows the cursor on the frame clock with no easing lag. Only the dragged card moves, the others never shuffle, and the ghost slot glides between cells (`MOTION.fast`).
- **Lift and settle.** On pick-up the card scales to 1.03 and gains a soft shadow. On drop it settles into its slot with `EASE.out` and no bounce, as DESIGN.md requires. Add and remove animate in place with scale + fade, never as a pop.
- **Resize** morphs from the old size to the new one with the same motion, and the content re-lays out once, at the end, never every frame.
- **Hover affordances.** The resize handle and the remove badge fade in over 110ms, and nothing is visible at rest, so the desktop stays clean.
- **No jank at idle.** The analog clock's second hand sweeps on the frame clock only while the desktop is visible: it pauses when the active workspace has windows (AstalHyprland), and so does every other ticking widget. Polls are shared, and fx refreshes on file change, not on a tight timer.
- **Typography and spacing** follow the existing tokens (SF Pro Text, the 4px grid, `$radius-xl`). Numbers use tabular figures, so digits don't shift as the clock and stats tick.
- **Gallery previews** are live widgets built once and reused, so the sheet opens without a stall. The sheet slides up with `ENTER.card`-style motion and Hyprland fades the scrim.

### Styling (`styles/_desktop.scss`)
- Card: `$panel-bg` glass, 1px `rgba($outline-variant,.6)` hairline, `$radius-xl` (20), 12px padding.
- Accents: `$primary` for rings, progress and the clock hand; `$tertiary` for Vision widgets; `$error` for severity 5. Light mode follows automatically, and no hex colours are hardcoded.
- Ghost slot: dashed `$outline`. Remove badge: `$surface-container-highest` circle. Scrim: `rgba($scrim,.35)`.
- Hyprland: add `desktop` to the `ags-blur` layer rule namespaces in `hypr/hyprland.lua`.

## Files

**AGS (`~/.config/ags`)**
- New: `widget/desktop/{Desktop,Frame,Gallery}.tsx`, `widget/desktop/{layout,store,registry}.ts`, `widget/desktop/layout.test.ts`, `widget/desktop/registry.test.ts` (each def's `defaultSize` is in its `sizes`; kinds are unique), `widget/desktop/widgets/{FxToday,FxTasks,Clock,Calendar,System,Note,Goal,Countdown}.tsx`, `widget/desktop/widgets/draw.ts`, `service/{fx,fxModel,system}.ts`, `service/fxModel.test.ts`, `styles/_desktop.scss`
- Edit: `app.ts` (mount `Desktop`, add the `toggle-widgets` request), `style.scss`, `widget/common/motion.ts`, `widget/bar/quicksettings/Resources.tsx`, `widget/pomodoropill/PomodoroStats.tsx` (import `roundRect`), `package.json` (test glob gains `service/**/*.test.ts`), `DESIGN.md` (new Desktop widgets section and motion presets)
- Spec copy: `docs/superpowers/specs/2026-10-21-desktop-widgets-design.md` (this design)

**Hyprland:** `~/.config/hypr/hyprland.lua` (blur namespace, Super+G bind)

**fx (`~/Projects/fx`):** new `src/fx/status.py` and `tests/test_status.py`; edit `src/fx/app.py` (`main` argparse) and `README.md`

## Build order (each step ends green and committed)
1. Save the spec to `docs/superpowers/specs/` and commit.
2. **Spike: layer switching.** Check that `Astal.Window.layer` can change from BOTTOM to TOP on a mapped surface under Hyprland. If it can't, edit mode becomes a second TOP-layer window that holds the scrim and the gallery, and drag-from-gallery is dropped (click-to-add only).
3. `layout.ts` + tests (TDD).
4. fx: `status.py` + pytest (TDD), then the `main` argparse change.
5. `fxModel.ts` + tests, `fx.ts`, and `system.ts` (with the Resources refactor).
6. `store.ts`, `Desktop.tsx`, `Frame.tsx`: the grid, drag, resize and context menus, with Clock as the first widget.
7. The remaining widgets and the registry test.
8. Gallery, edit mode, Super+G, the Hyprland blur rule.
9. `_desktop.scss` polish, DESIGN.md, motion presets.

## Size estimate
About 4,000 lines in total:

| Area | Lines |
|---|---|
| Grid model + tests | ≈450 |
| Host, drag/resize, persistence | ≈800 |
| Gallery + edit mode | ≈450 |
| 8 widgets + draw helpers | ≈1,200 |
| Services + Resources refactor | ≈300 |
| SCSS | ≈500 |
| fx `status` + tests | ≈200 |

Roughly 3–5 hours of Claude working time across 2–3 sessions, plus a hands-on check of how it feels after steps 6, 8 and 9. The uncertain parts are the layer-switch spike (step 2) and tuning the drag feel.

## Verification
- `cd ~/.config/ags && npm test`: the layout, fxModel and registry tests pass.
- `cd ~/Projects/fx && uv run pytest`, and `fx status --json | python3 -m json.tool` matches today's report (score 41, focus ≈3h09).
- Restart AGS (`agsr`) and check by hand:
  - Widgets show on an empty workspace.
  - Dragging snaps and settles; dropping on an occupied cell moves the widget to the nearest free spot.
  - The corner handle snaps S→M→L; the context menu sizes and Remove work.
  - Note typing works, and dragging from inside the note doesn't move the card.
  - Edit mode (Super+G, and right-click on the desktop) lifts above windows, dims them, and shows the gallery; drag-from-gallery and click-to-add both work.
  - The layout survives `agsr`.
  - Ticking a task in the fx TUI updates the fx Tasks widget within about 1s.
  - Switching accent or light/dark in Quick Settings re-themes every widget.
- A corrupted `desktop.json` falls back to the default layout and leaves a `.bak`.
