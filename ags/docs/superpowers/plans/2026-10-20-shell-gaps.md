# AGS Gaps: Media, Notifications, Calendar, OSD, Workspaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the five "clear gaps" in the AGS shell (media player, rich notifications, calendar, broader OSD, dynamic workspaces) and fix the duplicated brightness keybind.

**Architecture:** Follow the existing overview pattern: logic that can be pure lives in a small `.ts` model file with a `node --test` suite next to it, and the `.tsx` widget only wires GObject bindings to that model. Each feature gets its own SCSS partial (or extends the existing one) using `_tokens.scss` / `_mixins.scss` and the `MOTION` tokens; no hard-coded colours or durations (DESIGN.md rules).

**Tech Stack:** AGS v3 / gnim JSX on GTK4, Astal libs (Hyprland, Notifd, Wp, Mpris — new), SCSS, `node --test` for the pure models, Hyprland Lua config.

**Spec:** the "Clear gaps" list from this conversation, plus the user's choices: media = bar pill + popover; calendar = merged with notifications in one panel opened from clock or bell.

## Context

The current shell (`~/.config/ags`) has no media UI, text-only notifications that always vanish after 5s, no calendar, an OSD limited to volume/brightness, and workspaces hardcoded to 1–5. Separately, `hypr/hyprland.lua` binds `XF86MonBrightnessUp/Down` twice (lines 281–282 with the OSD request, 324–325 without), so one key press runs brightnessctl twice.

## Global Constraints

- Colours only via tokens/roles in `styles/_tokens.scss` + `colors.scss`; urgent/critical uses `$error`/`$on-error`; on-states use `@include on-state`.
- Durations only via `$dur*` (SCSS) and `MOTION.*` (TS, `widget/common/motion.ts`). Surfaces use `enter()/exit()` from that file.
- Bar items are `$bar-item-h` (24px) tall and use `interactive($radius-sm)`; text/composite buttons use `padding: 0 $spacing-2`.
- Hyprland dispatch syntax is Lua: `hyprctl dispatch 'hl.dsp.focus({ workspace = <x> })'`.
- Pure model files import nothing from GTK/Astal so `npm test` (`node --test 'widget/**/*.test.ts'`) can run them.
- New partials are added to `style.scss` with `@use`.
- Commit after each task with the Co-Authored-By line from the session attribution.

## Review Focus

1. **No media player running / player closes mid-playback** → pill hides, popover closes, no GJS error. (Task 6: `pickPlayer([])` returns `null` test.)
2. **Critical notification or `expireTimeout = 0`** → toast stays until clicked; `-1` → default 5000ms. (Task 2: `toastTimeout` tests.)
3. **Notification with actions but no body/icon** → row renders without empty gaps; the action invokes and dismisses. (Task 2: manual check with `notify-send -A`.)
4. **Workspace 7 opened from keyboard** → bar grows to 7 slots, shrinks back to 5 when it empties; special workspaces (negative ids) never appear as slots. (Task 1: `slots` tests.)
5. **Muting the mic or toggling Caps Lock during the 1.5s startup window** → no OSD (keep the existing `ready` guard); kbd backlight file missing on another machine → OSD silently skips it. (Task 5: `ledEvents` test with `null` readings.)

---

### Task 0: Fix the duplicate brightness bind

**Files:**
- Modify: `~/.config/hypr/hyprland.lua:324-325` (delete both lines)

- [ ] **Step 1:** Record the current value: `brightnessctl -m | cut -d, -f4`.
- [ ] **Step 2:** Delete lines 324–325 (`brightnessctl -e4 -n2 set 5%±`). Keep 281–282, which also request the OSD.
- [ ] **Step 3:** Press XF86MonBrightnessUp once. Expected: the value rises by exactly 5 points and the OSD shows the new value. (Before the fix it rose by about 10 and the OSD could show a stale value.)
- [ ] **Step 4:** Commit: `fix(hypr): drop duplicate brightness binds that bypassed the OSD`.

### Task 1: Dynamic workspaces

**Files:**
- Create: `widget/bar/modules/workspaces.ts`, `widget/bar/modules/workspaces.test.ts`
- Modify: `widget/bar/modules/Workspaces.tsx`, `styles/_bar.scss:73-95`

**Interfaces:**
- Produces: `export interface Slot { id: number; active: boolean; occupied: boolean; urgent: boolean }`
- Produces: `export function slots(ws: { id: number; clients: number }[], focusedId: number, urgent: ReadonlySet<number>, min = 5): Slot[]`

- [ ] **Step 1: Write failing tests** (`workspaces.test.ts`, same style as `widget/overview/nav.test.ts`):
  - `slots([], 1, new Set())` gives ids `[1,2,3,4,5]` with only id 1 `active`.
  - `slots([{id:7,clients:1}], 7, new Set())` gives ids `1..7`, and 7 is `active` and `occupied`.
  - Negative ids are ignored: `slots([{id:-98,clients:2}], 1, new Set())` gives 5 slots.
  - `occupied` is false when `clients === 0`.
  - `urgent` comes from the set: `slots([], 1, new Set([3]))[2].urgent === true`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `slots`.** The slot count is `max(min, highest positive id among ws, focusedId)`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Rewire `Workspaces.tsx`.**
  - Derive slots from `createBinding(hypr, "workspaces")`, `focusedWorkspace` and `clients`. Recompute on `client-added`, `client-removed` and `client-moved`.
  - Track urgency in a `createState<Set<number>>`. Add the id on `hypr.connect("urgent", (_, c) => …c.workspace.id)` and remove it when that workspace becomes focused.
  - Render the slots with `<For>`. The class is `ws-btn` plus `active`, `occupied` and `urgent` as they apply.
  - Add a `Gtk.EventControllerScroll` (VERTICAL) that dispatches `hl.dsp.focus({ workspace = "e+1" })` or `"e-1"`. Throttle it to one dispatch per `MOTION.fast`.
  - Add a trailing special-workspace button, visible when any workspace has `id < 0` and clients. It shows `.pip.special` and dispatches `hl.dsp.workspace.toggle_special("magic")`.
- [ ] **Step 6: SCSS.**
  - `.occupied .pip` uses `$on-surface-variant`.
  - `.urgent .pip` uses `$error` with the existing `.pulse` animation from `_base.scss`.
  - `.pip.special` is a 6px ring (a `$primary` border on a transparent fill).
- [ ] **Step 7: Verify.** Restart AGS with SUPER+SHIFT+R. Then:
  - SUPER+7 shows 7 pips. Leaving the empty workspace 7 shrinks the bar back to 5.
  - Scrolling over the pips switches workspace.
  - In a kitty window on workspace 2, run `sleep 3; printf '\a'`, then switch to workspace 1. Workspace 2's pip turns red and pulses, and it clears when you focus workspace 2.
- [ ] **Step 8:** Commit: `ags(workspaces): dynamic slots, occupied/urgent state, scroll and special workspace`.

### Task 2: Notification model and shared rich row

**Files:**
- Create: `widget/notifications/model.ts`, `widget/notifications/model.test.ts`, `widget/notifications/NotifRow.tsx`
- Modify: `styles/_popovers.scss` (move the `.notif*` rules into a new `styles/_notifications.scss`, and `@use` it in `style.scss`)

**Interfaces:**
- Produces: `export function toastTimeout(n: { expireTimeout: number; urgency: number }, fallback = 5000): number | null`. It returns `null` for sticky toasts (urgency 2 = critical, or `expireTimeout === 0`), `fallback` for `-1`, and `expireTimeout` otherwise.
- Produces: `export function relTime(nowSec: number, timeSec: number): string`. It returns `"now"` under 60s, `"5m"`, `"3h"`, then `"Mon"`-style weekday under 7 days, and `"12 Oct"` after that.
- Produces: `export function groupByApp<T extends { appName: string; time: number }>(list: T[]): { app: string; items: T[] }[]`. Groups are ordered by their newest item, and items newest-first.
- Produces: `NotifRow({ n, onDone }: { n: AstalNotifd.Notification; onDone?: () => void })`. It returns a `Gtk.Box` with class `notif` (plus `critical` when `n.urgency === 2`) and contains:
  - the icon, from `n.image` if that's a file path, else `n.appIcon || n.desktopEntry`, else hidden
  - the summary, and the body when it isn't empty, rendered with `useMarkup`
  - one button per `n.actions` entry, calling `n.invoke(a.id)` then `onDone?.()`
  - the `x` dismiss button

- [ ] **Step 1: Write failing tests** for the three pure functions, using the exact values above. Include: `toastTimeout({expireTimeout:-1,urgency:1})===5000`, `toastTimeout({expireTimeout:0,urgency:1})===null`, `toastTimeout({expireTimeout:8000,urgency:2})===null`, `relTime(1000,1000-30)==="now"`, and `groupByApp` putting the app with the newest notification first.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `model.ts`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Implement `NotifRow.tsx` and the `_notifications.scss` styles:
  - icon 32px, `$radius-sm`
  - `.actions` row with `interactive($radius-sm)` buttons
  - `.critical` adds a 2px `$error` left border
- [ ] **Step 6:** Commit: `ags(notifications): pure timeout/time/grouping model and shared rich row`.

### Task 3: Toasts use the rich row and honour timeouts

**Files:**
- Modify: `widget/toasts/Toasts.tsx`, `styles/_toasts.scss`

**Interfaces:**
- Consumes: `NotifRow` and `toastTimeout` from Task 2.

- [ ] **Step 1:** In `show()`, replace the three `label(...)` children with `NotifRow({ n, onDone: () => leave() })`. Keep the `.toast` wrapper, the `in`/`out` motion and the same-id replacement logic.
- [ ] **Step 2:** Replace `timeout(5000, …)` with `const ms = toastTimeout(n); if (ms !== null) timeout(ms, () => leave())`. Also call `leave()` on `n.connect("resolved", …)`, so a toast dismissed elsewhere disappears.
- [ ] **Step 3:** Clicking the body still dismisses the toast. The action buttons must claim their click so they don't also trigger the body's dismiss.
- [ ] **Step 4: Verify.** Restart AGS, then:
  - `notify-send -i firefox "Hi" "body"` shows an icon and auto-hides after about 5s.
  - `notify-send -u critical "Crit" "stays"` stays until clicked and has a red edge.
  - `notify-send -A yes=Yes -A no=No "Ask" ""` shows two buttons. Clicking Yes prints `yes` in the terminal that ran `notify-send` and closes the toast.
  - `notify-send -t 1500 "short" ""` hides after about 1.5s.
- [ ] **Step 5:** Commit: `ags(toasts): icons, actions, urgency and expire-timeout`.

### Task 4: Merged clock + notifications + calendar panel

**Files:**
- Create: `widget/bar/modules/DateMenu.tsx`
- Delete: `widget/bar/modules/Notifications.tsx` (its list moves into DateMenu)
- Modify: `widget/bar/modules/Clock.tsx` (export the content box, so it isn't a top-level bar item), `widget/bar/Bar.tsx` (the center box becomes `<DateMenu /><Media />`; Media is added in Task 6), `styles/_notifications.scss`, `styles/_bar.scss`

**Interfaces:**
- Consumes: `NotifRow`, `groupByApp` and `relTime` from Task 2.
- Produces: `export default function DateMenu()`, the bar item.

- [ ] **Step 1: Build `DateMenu`.**
  - It's one `<menubutton class="datemenu">`. The button child is the existing Clock content (time plus the hover-revealed date), then `Sep`, then the bell icon with its count badge, so clicking either opens the same popover.
  - The popover is `class="qs-pop"`. Its `.datemenu-panel` (`@include panel`) is a horizontal box:
    - **Left (320px):** "Notifications" title, a DND toggle (reuse `Tile`'s on-state styling via `@include on-state`), then a scrolled list from `groupByApp`. Each group has a header with the app name, a `relTime` of its newest item and a "clear group" `x`, followed by `NotifRow`s. Keep the existing empty state and "Clear all".
    - **Right:** `<Gtk.Calendar showHeading showDayNames />` with today selected, plus a full-date heading above it (`date '+%A, %d %B %Y'`, polled every 60s).
  - Recompute the `relTime` labels only while the popover is open: a `createPoll` gated on the `notify::visible` state, the same way `QuickSettings.tsx` gates `Accents`/`Resources` with `open`.
- [ ] **Step 2: Style the calendar** (`calendar`, `calendar > header`, `calendar grid label:selected`) with tokens. The selected day uses `on-state`, and other-month days use `$text-faint`.
- [ ] **Step 3: Verify.** Restart AGS, then:
  - Clicking the clock and clicking the bell open the same panel.
  - Three `notify-send -a A …` plus one `-a B …` show two groups, with B on top if it was sent last.
  - "Clear group" removes only that app's notifications.
  - The calendar shows today in the accent colour, and its arrows change month.
  - The DND toggle mirrors the quick settings DND tile.
- [ ] **Step 4:** Commit: `ags(datemenu): merge clock, grouped notifications and calendar into one panel`.

### Task 5: OSD for mic mute, Caps Lock, keyboard backlight and output device

**Files:**
- Create: `widget/osd/model.ts`, `widget/osd/model.test.ts`
- Modify: `widget/osd/Osd.tsx`, `styles/_osd.scss`

**Interfaces:**
- Produces: `export type Leds = { caps: boolean | null; kbd: number | null; kbdMax: number | null }` (`null` means the sysfs file is missing)
- Produces: `export type OsdEvent = { kind: "caps"; on: boolean } | { kind: "kbd"; value: number }` (`value` is 0–1)
- Produces: `export function ledEvents(prev: Leds, next: Leds): OsdEvent[]`. It emits only on a change between two non-null readings, and divides `kbd` by `kbdMax`.

- [ ] **Step 1: Write failing tests.**
  - caps `false` to `true` gives `[{kind:"caps",on:true}]`.
  - kbd 1 to 2 with max 3 gives `[{kind:"kbd",value:2/3}]`.
  - Unchanged readings give `[]`.
  - Any `null` on either side gives no event for that field.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `ledEvents`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Wire it up in `Osd.tsx`.**
  - **Text mode:** add a "text" mode to `show()`: `showText(glyph: string, text: string)` hides `bar`, puts the text in `pct` and adds the class `text`. `show()` restores the bar.
  - **Mic:** `AstalWp.get_default()?.audio.defaultMicrophone`, on `notify::mute`, calls `showText` with glyph `` (muted) or `` and the text "Mic muted" or "Mic on".
  - **LEDs:** every 250ms (a GLib timeout, started after `ready`), read `/sys/class/leds/*::capslock/brightness` and `/sys/class/leds/*::kbd_backlight/{brightness,max_brightness}` with `readFile` from `ags/file`. Resolve the globs once at startup with `GLib.Dir` and store `null` when there's no match.
    - Caps events call `showText(""/"", "Caps Lock on/off")`.
    - kbd events call `show("", value)`.
  - **Output device:** listen to `speaker.connect("notify::description", …)` and call `showText("", speaker.description)`. Suppress the volume OSD that fires within `MOTION.base` ms after a device switch, so the device name isn't immediately covered.
  - Everything respects the existing `ready` guard.
- [ ] **Step 6:** SCSS: `.osd-card.text .osd-pct` drops `widthChars` alignment, and uses `font-weight: 600` with `margin-left: 0`.
- [ ] **Step 7: Verify.** Restart AGS, then:
  - XF86AudioMicMute shows "Mic muted".
  - Caps Lock shows "Caps Lock on", then "off".
  - Fn + kbd-backlight key shows a bar at 0, 50 or 100%.
  - `wpctl set-default <other sink id>` shows the device name.
  - Nothing shows during the first 1.5s after `ags run`.
- [ ] **Step 8:** Commit: `ags(osd): mic mute, caps lock, keyboard backlight and output-device OSDs`.

### Task 6: Media player pill + popover

**Files:**
- Create: `widget/media/model.ts`, `widget/media/model.test.ts`, `widget/media/Media.tsx`, `styles/_media.scss`
- Modify: `widget/bar/Bar.tsx` (center box: `<DateMenu /><Media />`), `style.scss`, `env.d.ts` only if the gi import needs a type stub

**Prerequisite (user runs it, since it needs sudo):** `! yay -S libastal-mpris-git`. Check that `/usr/lib/girepository-1.0/AstalMpris-0.1.typelib` exists afterwards.

**Interfaces:**
- Produces: `export function fmtTime(sec: number): string`. It returns `"0:00"` for values that are negative or not finite, `"3:07"`, and `"1:02:03"` once past an hour.
- Produces: `export function pickPlayer<P extends { busName: string; playbackStatus: number }>(players: P[], preferred?: string): P | null`. It returns the player whose `busName === preferred` if it still exists, else the first one that's playing (status 0 = PLAYING in AstalMpris), else `players[0]`, else `null`.

- [ ] **Step 1: Write failing tests** for both functions, including `pickPlayer([])===null` and the case where a preferred player has disappeared and the function falls back to the one playing.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Implement `Media.tsx`.**
  - **Player:** `AstalMpris.get_default()`, from a `createBinding(mpris, "players")` plus a `createState<string>` for the preferred bus name. The current player is `pickPlayer(...)`.
  - **Pill** (`<menubutton class="media-pill">`, visible only when there's a player):
    - It has a `Sep` on its left, a play/pause glyph and a title label (`maxWidthChars={28}`, ellipsized). It renders inside `<With value={current}>` so every binding follows a player change.
    - Scrolling over it calls `next()` or `previous()`, and a middle click calls `play_pause()`.
  - **Popover** (`qs-pop`), whose `.media-card` uses `@include panel`, from top to bottom:
    - cover art (a 64px `Gtk.Picture` from `player.coverArt`, falling back to the app's `entry` icon)
    - title, then artist in `$text-muted`
    - a `Slider` (reuse `widget/bar/quicksettings/Slider.tsx` if it accepts value/onChange, else a plain `<slider>` with the `track` mixin) bound to `position/length`, setting `player.position` on user change only
    - `fmtTime(position)` and `fmtTime(length)`
    - prev, play/pause and next buttons, with play/pause using `on-state`
    - when there's more than one player, a row of player-name chips that set the preferred bus name
  - Hide the seek row when `length <= 0` (streams) or `!canSeek`.
- [ ] **Step 6: Verify.** Restart AGS, then:
  - With nothing playing, the pill is hidden.
  - Play something in Zen/YouTube or `mpv` and the pill appears with the title. The popover shows the cover, and seeking moves playback.
  - The XF86 media keys and the pill stay in sync.
  - Close the player and the pill disappears with no errors in `ags run` output.
  - With two players, the chips switch between them.
- [ ] **Step 7:** Update `DESIGN.md`: add the media pill to the Bar section, add the urgent role (`$error`) to the colour table, and list the new `_notifications.scss` / `_media.scss` partials.
- [ ] **Step 8:** Commit: `ags(media): mpris pill with cover, controls and seek popover`.

## Verification (whole branch)

1. `cd ~/.config/ags && npm test`: every suite passes, including the existing overview ones.
2. Restart with SUPER+SHIFT+R and watch the terminal for GJS warnings while you run each task's manual checks.
3. Do a final scan for hard-coded hex values and durations: `grep -nE '#[0-9a-fA-F]{3,6}|[0-9]+ms' styles/_notifications.scss styles/_media.scss` should only find tokens.

## Execution notes

- Before execution starts, copy this plan to `~/.config/ags/docs/superpowers/plans/2026-10-20-shell-gaps.md`, following the repo's convention.
- Tasks 0, 1, 5 and 6 are independent. Task 3 and Task 4 depend on Task 2. Task 6 needs the AUR package installed first.
